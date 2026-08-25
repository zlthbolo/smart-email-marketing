package com.jareed.soft;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Patterns;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.Properties;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.mail.Message;
import javax.mail.AuthenticationFailedException;
import javax.mail.MessagingException;
import javax.mail.Session;
import javax.mail.Transport;
import javax.net.ssl.SSLHandshakeException;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;

@CapacitorPlugin(name = "LocalMail")
public class LocalMailPlugin extends Plugin {
    private static final String PREFERENCES = "jareed_private_store";
    private static final String MAILBOXES = "mailboxes";
    private static final String OUTBOX = "outbox";
    private static final String KEY_ALIAS = "jareed_local_mail_key_v1";
    private static final ExecutorService EXECUTOR = Executors.newCachedThreadPool();

    @PluginMethod
    public void listMailboxes(PluginCall call) {
        try {
            JSONArray stored = readEncryptedArray(MAILBOXES);
            JSArray mailboxes = new JSArray();
            for (int index = 0; index < stored.length(); index++) mailboxes.put(publicMailbox(stored.getJSONObject(index)));
            JSObject result = new JSObject(); result.put("mailboxes", mailboxes); call.resolve(result);
        } catch (Exception error) {
            call.reject("تعذر قراءة حسابات المرسلين المشفّرة: " + safeMessage(error));
        }
    }

    @PluginMethod
    public void saveMailbox(PluginCall call) {
        try {
            String provider = clean(call.getString("provider", ""));
            String email = clean(call.getString("email", "")).toLowerCase(Locale.ROOT);
            if (!provider.equals("smtp") && !provider.equals("api") && !provider.equals("test_sink")) throw new IllegalArgumentException("نوع المرسل غير مدعوم.");
            if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) throw new IllegalArgumentException("عنوان البريد غير صحيح.");

            String host = clean(call.getString("host", "")).toLowerCase(Locale.ROOT);
            String username = clean(call.getString("username", ""));
            String password = clean(call.getString("password", ""));
            String apiKind = clean(call.getString("apiKind", "")).toLowerCase(Locale.ROOT);
            String apiKey = clean(call.getString("apiKey", ""));
            Integer rawPort = call.getInt("port");
            Integer rawLimit = call.getInt("dailyLimit");
            Boolean rawSecure = call.getBoolean("secure");
            int port = rawPort == null ? 587 : rawPort;
            int dailyLimit = rawLimit == null ? 25 : rawLimit;
            boolean secure = rawSecure != null && rawSecure;
            if (dailyLimit < 1 || dailyLimit > 500) throw new IllegalArgumentException("الحد اليومي يجب أن يكون بين 1 و500.");
            if (provider.equals("smtp")) {
                if (host.equals("smtp.gmail.com")) {
                    password = password.replaceAll("\\s+", "");
                    if (port == 465) secure = true;
                    if (port == 587) secure = false;
                }
                if (host.equals("smtp.office365.com") || host.equals("smtp-mail.outlook.com")) { port = 587; secure = false; }
                if (host.isEmpty() || port < 1 || port > 65535 || password.isEmpty()) throw new IllegalArgumentException("أدخل عنوان SMTP والمنفذ وكلمة مرور التطبيق.");
                if (username.isEmpty()) username = email;
            }
            if (provider.equals("api")) {
                if ((!apiKind.equals("resend") && !apiKind.equals("postmark")) || apiKey.isEmpty()) throw new IllegalArgumentException("اختر Resend أو Postmark وأدخل مفتاح API.");
                if (apiKind.equals("resend") && !apiKey.startsWith("re_")) throw new IllegalArgumentException("صيغة مفتاح Resend غير صحيحة.");
                if (apiKind.equals("resend") && isPublicMailboxDomain(email)) throw new IllegalArgumentException("Resend لا يرسل من Gmail أو بريد عام. استخدم onboarding@resend.dev للاختبار، أو بريد نطاق موثّق.");
            }

            JSONArray mailboxes = readEncryptedArray(MAILBOXES);
            int duplicate = -1;
            String mailboxId = UUID.randomUUID().toString();
            for (int index = 0; index < mailboxes.length(); index++) {
                JSONObject current = mailboxes.getJSONObject(index);
                if (email.equalsIgnoreCase(current.optString("email")) && provider.equals(current.optString("provider"))) {
                    duplicate = index; mailboxId = current.optString("id", mailboxId); break;
                }
            }

            JSONObject mailbox = new JSONObject();
            mailbox.put("id", mailboxId);
            mailbox.put("provider", provider);
            mailbox.put("display_name", clean(call.getString("displayName", "")));
            mailbox.put("email", email);
            mailbox.put("host", host);
            mailbox.put("port", port);
            mailbox.put("username", username);
            mailbox.put("password", password);
            mailbox.put("secure", secure);
            mailbox.put("api_kind", apiKind);
            mailbox.put("api_key", apiKey);
            mailbox.put("daily_limit", dailyLimit);
            mailbox.put("sent_today", 0);
            mailbox.put("sent_date", today());
            mailbox.put("status", "pending");
            mailbox.put("last_error", JSONObject.NULL);
            mailbox.put("created_at", isoNow());
            if (duplicate >= 0) mailboxes.put(duplicate, mailbox); else mailboxes.put(mailbox);
            writeEncryptedArray(MAILBOXES, mailboxes);

            JSObject result = new JSObject(); result.put("mailbox", publicMailbox(mailbox)); call.resolve(result);
        } catch (Exception error) {
            call.reject(safeMessage(error));
        }
    }

    @PluginMethod
    public void deleteMailbox(PluginCall call) {
        try {
            String id = clean(call.getString("id", ""));
            JSONArray mailboxes = readEncryptedArray(MAILBOXES); JSONArray kept = new JSONArray(); boolean deleted = false;
            for (int index = 0; index < mailboxes.length(); index++) {
                JSONObject mailbox = mailboxes.getJSONObject(index);
                if (id.equals(mailbox.optString("id"))) deleted = true; else kept.put(mailbox);
            }
            writeEncryptedArray(MAILBOXES, kept);
            JSObject result = new JSObject(); result.put("deleted", deleted); call.resolve(result);
        } catch (Exception error) {
            call.reject("تعذر حذف الحساب: " + safeMessage(error));
        }
    }

    @PluginMethod
    public void verifyMailbox(PluginCall call) {
        String id = clean(call.getString("id", ""));
        EXECUTOR.execute(() -> {
            try {
                JSONObject mailbox = requireMailbox(id);
                String provider = mailbox.getString("provider");
                if (provider.equals("smtp")) verifySmtp(mailbox);
                else if (provider.equals("api")) { call.reject("تحقق API يتم بإرسال حقيقي. اضغط «تحقق بإرسال»."); return; }
                else if (!provider.equals("test_sink")) throw new IllegalArgumentException("نوع المرسل غير مدعوم.");
                updateMailboxStatus(id, "healthy", null);
                JSObject result = new JSObject();
                result.put("status", "healthy");
                result.put("detail", provider.equals("test_sink") ? "صندوق الاختبار المحلي جاهز، لكنه لا يرسل إلى الإنترنت." : "نجح اتصال حقيقي بمزود البريد.");
                call.resolve(result);
            } catch (Exception error) {
                try { updateMailboxStatus(id, "unhealthy", safeMessage(error)); } catch (Exception ignored) {}
                call.reject("فشل تحقق المزود: " + safeMessage(error));
            }
        });
    }

    @PluginMethod
    public void sendTest(PluginCall call) {
        String id = clean(call.getString("id", ""));
        String recipient = clean(call.getString("to", "")).toLowerCase(Locale.ROOT);
        if (!Patterns.EMAIL_ADDRESS.matcher(recipient).matches()) { call.reject("عنوان المستلم غير صحيح."); return; }
        EXECUTOR.execute(() -> {
            JSONObject mailbox = null;
            boolean providerAttempted = false;
            try {
                mailbox = requireMailbox(id); resetDailyCounter(mailbox);
                int sentToday = mailbox.optInt("sent_today", 0);
                int dailyLimit = mailbox.optInt("daily_limit", 25);
                if (sentToday >= dailyLimit) throw new IllegalStateException("وصل الحساب إلى الحد اليومي المحلي.");
                String provider = mailbox.getString("provider");
                String messageId;
                boolean accepted;
                if (provider.equals("smtp")) { providerAttempted = true; messageId = sendSmtp(mailbox, recipient); accepted = true; }
                else if (provider.equals("api")) { providerAttempted = true; messageId = sendApi(mailbox, recipient); accepted = true; }
                else if (provider.equals("test_sink")) { messageId = saveTestSink(recipient); accepted = false; }
                else throw new IllegalArgumentException("نوع المرسل غير مدعوم.");
                mailbox.put("status", "healthy");
                mailbox.put("last_error", JSONObject.NULL);
                if (accepted) mailbox.put("sent_today", sentToday + 1);
                replaceMailbox(mailbox);
                JSObject result = new JSObject();
                result.put("provider", provider);
                result.put("providerMessageId", messageId);
                result.put("accepted", accepted);
                call.resolve(result);
            } catch (Exception error) {
                if (providerAttempted && mailbox != null) {
                    try { updateMailboxStatus(id, "unhealthy", safeMessage(error)); } catch (Exception ignored) {}
                }
                call.reject("لم تُرسل الرسالة: " + safeMessage(error));
            }
        });
    }

    @PluginMethod
    public void listOutbox(PluginCall call) {
        try {
            JSONArray stored = readEncryptedArray(OUTBOX); JSArray messages = new JSArray();
            for (int index = 0; index < stored.length(); index++) messages.put(stored.getJSONObject(index));
            JSObject result = new JSObject(); result.put("messages", messages); call.resolve(result);
        } catch (Exception error) {
            call.reject("تعذر قراءة صندوق الاختبار: " + safeMessage(error));
        }
    }

    private void verifySmtp(JSONObject mailbox) throws Exception {
        Session session = smtpSession(mailbox);
        Transport transport = session.getTransport("smtp");
        try { transport.connect(mailbox.getString("host"), mailbox.getInt("port"), mailbox.getString("username"), mailbox.getString("password")); }
        catch (Exception error) { throw new IllegalStateException(smtpErrorMessage(mailbox, error), error); }
        finally { if (transport.isConnected()) transport.close(); }
    }

    private String sendSmtp(JSONObject mailbox, String recipient) throws Exception {
        Session session = smtpSession(mailbox);
        MimeMessage message = new MimeMessage(session);
        String displayName = mailbox.optString("display_name", "");
        message.setFrom(new InternetAddress(mailbox.getString("email"), displayName, StandardCharsets.UTF_8.name()));
        message.setRecipient(Message.RecipientType.TO, new InternetAddress(recipient));
        message.setSubject("اختبار جريد سوفت", StandardCharsets.UTF_8.name());
        message.setText("هذه رسالة اختبار حقيقية أُرسلت مباشرة من تطبيق جريد سوفت على هاتفك.", StandardCharsets.UTF_8.name());
        message.setSentDate(new Date()); message.saveChanges();
        Transport transport = session.getTransport("smtp");
        try {
            transport.connect(mailbox.getString("host"), mailbox.getInt("port"), mailbox.getString("username"), mailbox.getString("password"));
            transport.sendMessage(message, message.getAllRecipients());
        } catch (Exception error) { throw new IllegalStateException(smtpErrorMessage(mailbox, error), error); }
        finally { if (transport.isConnected()) transport.close(); }
        return message.getMessageID() == null ? "smtp-accepted-" + UUID.randomUUID() : message.getMessageID();
    }

    private Session smtpSession(JSONObject mailbox) {
        Properties properties = new Properties();
        boolean secure = mailbox.optBoolean("secure", false);
        properties.put("mail.smtp.auth", "true");
        properties.put("mail.smtp.connectiontimeout", "15000");
        properties.put("mail.smtp.timeout", "20000");
        properties.put("mail.smtp.writetimeout", "20000");
        properties.put("mail.smtp.ssl.enable", Boolean.toString(secure));
        properties.put("mail.smtp.ssl.checkserveridentity", "true");
        properties.put("mail.smtp.starttls.enable", Boolean.toString(!secure));
        properties.put("mail.smtp.starttls.required", Boolean.toString(!secure));
        return Session.getInstance(properties);
    }

    private String sendApi(JSONObject mailbox, String recipient) throws Exception {
        String kind = mailbox.getString("api_kind");
        String displayName = mailbox.optString("display_name", "");
        String from = displayName.isEmpty() ? mailbox.getString("email") : displayName + " <" + mailbox.getString("email") + ">";
        try {
            if (kind.equals("resend")) {
                JSONObject body = new JSONObject(); body.put("from", from); body.put("to", new JSONArray().put(recipient)); body.put("subject", "اختبار جريد سوفت"); body.put("text", "هذه رسالة اختبار حقيقية أُرسلت مباشرة من تطبيق جريد سوفت على هاتفك.");
                JSONObject response = httpJson("POST", "https://api.resend.com/emails", headers("Authorization", "Bearer " + mailbox.getString("api_key")), body);
                String value = response.optString("id", ""); if (value.isEmpty()) throw new IllegalStateException("لم يعِد Resend معرّف قبول."); return value;
            }
            if (kind.equals("postmark")) {
                JSONObject body = new JSONObject(); body.put("From", from); body.put("To", recipient); body.put("Subject", "اختبار جريد سوفت"); body.put("TextBody", "هذه رسالة اختبار حقيقية أُرسلت مباشرة من تطبيق جريد سوفت على هاتفك."); body.put("MessageStream", "outbound");
                JSONObject response = httpJson("POST", "https://api.postmarkapp.com/email", headers("X-Postmark-Server-Token", mailbox.getString("api_key")), body);
                String value = response.optString("MessageID", ""); if (value.isEmpty()) throw new IllegalStateException("لم يعِد Postmark معرّف قبول."); return value;
            }
        } catch (ProviderHttpException error) {
            throw new IllegalStateException(apiErrorMessage(kind, error));
        }
        throw new IllegalArgumentException("مزود API غير مدعوم.");
    }

    private JSONObject httpJson(String method, String address, JSONObject headers, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setRequestMethod(method); connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
        connection.setRequestProperty("Accept", "application/json");
        Iterator<String> names = headers.keys(); while (names.hasNext()) { String name = names.next(); connection.setRequestProperty(name, headers.getString(name)); }
        if (body != null) {
            connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder content = new StringBuilder();
        if (stream != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) { String line; while ((line = reader.readLine()) != null) content.append(line); }
        connection.disconnect();
        if (status < 200 || status >= 300) throw new ProviderHttpException(status, content.toString());
        return content.length() == 0 ? new JSONObject() : new JSONObject(content.toString());
    }

    private JSONObject headers(String name, String value) throws Exception { JSONObject headers = new JSONObject(); headers.put(name, value); return headers; }

    private String apiErrorMessage(String kind, ProviderHttpException error) {
        String provider = kind.equals("resend") ? "Resend" : "Postmark";
        String response = error.response.toLowerCase(Locale.ROOT);
        if (error.status == 401 || response.contains("invalid api key") || response.contains("invalid token")) return "مفتاح " + provider + " غير صحيح أو مُلغى.";
        if (error.status == 429) return "وصل حساب " + provider + " إلى حد الطلبات. حاول لاحقًا.";
        if (kind.equals("resend") && response.contains("only send testing emails")) return "onboarding@resend.dev يرسل للاختبار إلى بريد حساب Resend فقط.";
        if (kind.equals("resend") && (response.contains("domain is not verified") || response.contains("domain not verified") || (response.contains("domain") && response.contains("verify")))) return "بريد الإرسال غير موثّق في Resend. استخدم onboarding@resend.dev للاختبار أو نطاقًا موثّقًا.";
        if (error.status == 403) return "مفتاح " + provider + " لا يملك صلاحية الإرسال.";
        if (error.status >= 500) return "خدمة " + provider + " غير متاحة الآن. حاول لاحقًا.";
        return "رفض " + provider + " طلب الإرسال (" + error.status + ").";
    }

    private String smtpErrorMessage(JSONObject mailbox, Exception error) {
        String host = mailbox.optString("host", "").toLowerCase(Locale.ROOT);
        String details = errorDetails(error).toLowerCase(Locale.ROOT);
        boolean authentication = hasCause(error, AuthenticationFailedException.class) || details.contains("authentication") || details.contains("username and password not accepted") || details.contains("535");
        if (authentication && host.contains("gmail")) return "رفض Gmail تسجيل الدخول. فعّل التحقق بخطوتين واستخدم كلمة مرور تطبيق من 16 حرفًا، لا كلمة مرور Gmail.";
        if (authentication && (host.contains("office365") || host.contains("outlook"))) return "رفض Microsoft تسجيل الدخول. تحقق من كلمة المرور ومن تفعيل SMTP AUTH للحساب.";
        if (authentication) return "رفض خادم SMTP اسم المستخدم أو كلمة المرور.";
        if (hasCause(error, UnknownHostException.class)) return "عنوان خادم SMTP غير صحيح أو لا يوجد اتصال بالإنترنت.";
        if (hasCause(error, SocketTimeoutException.class)) return "انتهت مهلة الاتصال بخادم SMTP.";
        if (hasCause(error, ConnectException.class) || details.contains("couldn't connect") || details.contains("could not connect")) return "تعذر الاتصال بخادم SMTP. تحقق من الخادم والمنفذ.";
        if (hasCause(error, SSLHandshakeException.class) || details.contains("ssl handshake")) return "فشل اتصال SSL الآمن. تحقق من المنفذ وإعداد SSL.";
        return "رفض خادم SMTP الاتصال أو الإرسال.";
    }

    private boolean hasCause(Throwable error, Class<?> type) {
        Throwable current = error;
        for (int depth = 0; current != null && depth < 12; depth++) {
            if (type.isInstance(current)) return true;
            Throwable next = current.getCause();
            if (next == null && current instanceof MessagingException) next = ((MessagingException) current).getNextException();
            if (next == current) break;
            current = next;
        }
        return false;
    }

    private String errorDetails(Throwable error) {
        StringBuilder result = new StringBuilder();
        Throwable current = error;
        for (int depth = 0; current != null && depth < 12; depth++) {
            if (current.getMessage() != null) result.append(' ').append(current.getMessage());
            Throwable next = current.getCause();
            if (next == null && current instanceof MessagingException) next = ((MessagingException) current).getNextException();
            if (next == current) break;
            current = next;
        }
        return result.toString();
    }

    private boolean isPublicMailboxDomain(String email) {
        int separator = email.lastIndexOf('@');
        if (separator < 0) return true;
        String domain = email.substring(separator + 1).toLowerCase(Locale.ROOT);
        return domain.equals("gmail.com") || domain.equals("googlemail.com") || domain.equals("outlook.com") || domain.equals("hotmail.com") || domain.equals("live.com") || domain.equals("yahoo.com") || domain.equals("icloud.com") || domain.equals("aol.com") || domain.equals("proton.me") || domain.equals("protonmail.com");
    }

    private static final class ProviderHttpException extends Exception {
        private final int status;
        private final String response;
        private ProviderHttpException(int status, String response) { super("HTTP " + status); this.status = status; this.response = response == null ? "" : response; }
    }

    private synchronized JSONObject requireMailbox(String id) throws Exception {
        JSONArray mailboxes = readEncryptedArray(MAILBOXES);
        for (int index = 0; index < mailboxes.length(); index++) if (id.equals(mailboxes.getJSONObject(index).optString("id"))) return mailboxes.getJSONObject(index);
        throw new IllegalArgumentException("حساب المرسل غير موجود.");
    }

    private synchronized void updateMailboxStatus(String id, String status, String lastError) throws Exception {
        JSONArray mailboxes = readEncryptedArray(MAILBOXES);
        for (int index = 0; index < mailboxes.length(); index++) {
            JSONObject mailbox = mailboxes.getJSONObject(index);
            if (id.equals(mailbox.optString("id"))) { mailbox.put("status", status); mailbox.put("last_error", lastError == null ? JSONObject.NULL : lastError); break; }
        }
        writeEncryptedArray(MAILBOXES, mailboxes);
    }

    private synchronized void replaceMailbox(JSONObject replacement) throws Exception {
        JSONArray mailboxes = readEncryptedArray(MAILBOXES);
        for (int index = 0; index < mailboxes.length(); index++) if (replacement.optString("id").equals(mailboxes.getJSONObject(index).optString("id"))) { mailboxes.put(index, replacement); break; }
        writeEncryptedArray(MAILBOXES, mailboxes);
    }

    private void resetDailyCounter(JSONObject mailbox) throws Exception {
        if (!today().equals(mailbox.optString("sent_date"))) { mailbox.put("sent_date", today()); mailbox.put("sent_today", 0); replaceMailbox(mailbox); }
    }

    private synchronized String saveTestSink(String recipient) throws Exception {
        JSONArray outbox = readEncryptedArray(OUTBOX);
        JSONObject message = new JSONObject(); String messageId = "local-" + UUID.randomUUID();
        message.put("id", messageId); message.put("subject", "اختبار جريد سوفت"); message.put("recipient", recipient); message.put("created_at", isoNow()); message.put("html_body", "<p>رسالة اختبار محلية فقط، لم تُرسل إلى الإنترنت.</p>");
        JSONArray updated = new JSONArray(); updated.put(message); for (int index = 0; index < Math.min(outbox.length(), 99); index++) updated.put(outbox.get(index));
        writeEncryptedArray(OUTBOX, updated); return messageId;
    }

    private JSObject publicMailbox(JSONObject mailbox) throws Exception {
        JSObject result = new JSObject();
        result.put("id", mailbox.getString("id")); result.put("provider", mailbox.getString("provider")); result.put("display_name", mailbox.optString("display_name", "")); result.put("email", mailbox.getString("email"));
        result.put("host", mailbox.optString("host", "")); result.put("port", mailbox.optInt("port", 0)); result.put("username", mailbox.optString("username", "")); result.put("api_kind", mailbox.optString("api_kind", ""));
        result.put("status", mailbox.optString("status", "pending")); result.put("sent_today", mailbox.optInt("sent_today", 0)); result.put("effective_daily_limit", mailbox.optInt("daily_limit", 25));
        if (mailbox.isNull("last_error")) result.put("last_error", null); else result.put("last_error", mailbox.optString("last_error"));
        result.put("created_at", mailbox.optString("created_at", "")); return result;
    }

    private synchronized JSONArray readEncryptedArray(String name) throws Exception {
        String encrypted = preferences().getString(name, "");
        return encrypted == null || encrypted.isEmpty() ? new JSONArray() : new JSONArray(decrypt(encrypted));
    }

    private synchronized void writeEncryptedArray(String name, JSONArray value) throws Exception {
        if (!preferences().edit().putString(name, encrypt(value.toString())).commit()) throw new IllegalStateException("تعذر حفظ البيانات على الهاتف.");
    }

    private SharedPreferences preferences() { return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE); }

    private String encrypt(String plainText) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    private String decrypt(String encrypted) throws Exception {
        String[] parts = encrypted.split(":", 2); if (parts.length != 2) throw new IllegalStateException("صيغة التخزين المشفر غير صالحة.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    private SecretKey secretKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }
    private String isoNow() { SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US); format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date()); }
    private String clean(String value) { return value == null ? "" : value.trim(); }
    private String safeMessage(Exception error) {
        String message = error.getMessage() == null || error.getMessage().trim().isEmpty() ? error.getClass().getSimpleName() : error.getMessage().trim();
        message = message.replaceAll("re_[A-Za-z0-9_-]+", "[مفتاح مخفي]");
        return message.length() > 300 ? message.substring(0, 300) : message;
    }
}
