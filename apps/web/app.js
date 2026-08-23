const api = `${location.protocol}//${location.hostname}:3001`;
const labels = { healthy: 'سليم', unhealthy: 'متوقف' };
async function refresh(){
  const button=document.querySelector('#refresh'); button.disabled=true;
  try{
    const response=await fetch(`${api}/v1/health`,{cache:'no-store'}); const body=await response.json();
    document.querySelector('#overall').textContent=body.ok?'النظام الأساسي جاهز':'النظام في حالة متدهورة';
    document.querySelector('#dot').className=`dot ${body.ok?'ok':'bad'}`;
    document.querySelector('#checked').textContent=new Date(body.checkedAt).toLocaleString('ar');
    for(const name of ['postgres','redis']){const check=body.checks[name];document.querySelector(`#${name}`).textContent=labels[check.status]||check.status;document.querySelector(`#${name}-detail`).textContent=check.latencyMs!=null?`${check.latencyMs} ms`:check.error||'—';}
    document.querySelector('#providers').textContent=body.checks.providers.length?`${body.checks.providers.length} مهيأ`:'لم تُربط بعد';
  }catch(error){document.querySelector('#overall').textContent='تعذر الوصول إلى الـAPI';document.querySelector('#dot').className='dot bad';document.querySelector('#checked').textContent=error.message;}
  finally{button.disabled=false}
}
document.querySelector('#refresh').addEventListener('click',refresh); refresh();
