export function classifyThread(source) {
  if (source && typeof source==='object' && Object.hasOwn(source,'subAgent')) return true;
  return ['cli','vscode','exec','appServer','desktop'].includes(source) ? false : null;
}
export function mapNotification(message, sources) {
  const {hostId='local',method,params={}}=message;
  const threadId=params.threadId;
  const isSubagent=sources.get(`${hostId}/${threadId}`);
  if (typeof threadId!=='string'||typeof isSubagent!=='boolean') return null;
  if (method==='turn/completed' && typeof params.turn?.id==='string') return {hostId,threadId,turnId:params.turn.id,type:'completed',status:params.turn.status,isSubagent,replay:false};
  if (['item/commandExecution/requestApproval','item/fileChange/requestApproval','execCommandApproval','applyPatchApproval','item/tool/requestUserInput'].includes(method) && typeof params.turnId==='string') return {hostId,threadId,turnId:params.turnId,type:'approval',isSubagent,replay:false};
  return null;
}
