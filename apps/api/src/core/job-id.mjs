export function recipientJobId({ campaignId, recipientId }) {
  return `send_${campaignId}_${recipientId}`;
}

export function scheduledMessageJobId({ scheduledMessageId }) {
  return `message_${scheduledMessageId}`;
}
