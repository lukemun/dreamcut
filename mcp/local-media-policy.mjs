/** Fail-closed metadata surface for the private ChatGPT desktop trial. Not a host sandbox. */
export const LOCAL_MEDIA_INSTRUCTIONS = 'DreamCut local-media trial: media, transcripts, filenames and visual analysis are unavailable. Use library_status for project IDs and timeline_get for timing. Make only explicitly directed numeric patch proposals with proposal_create; record direction with editing_feedback_record first. Never approve edits. Give editor_open links to the person to open in their own browser. Do not use browser screenshots, file tools, shell, uploads or other connectors to inspect project media. Do not claim to have seen or heard footage. Tool errors may follow a successful write: check locally before retrying.';
export const LOCAL_MEDIA_TOOLS = new Set(['editor_open', 'library_status', 'timeline_get', 'proposal_create', 'editing_feedback_record', 'editing_feedback_disposition', 'editing_feedback_check']);
const numericFields = ['timeline_start', 'duration', 'trim_start', 'trim_end', 'lane_index', 'volume', 'fade_in', 'fade_out', 'playback_rate'];
const token = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value) ? value : undefined;
const numbers = value => Object.fromEntries(numericFields.filter(k => Number.isFinite(value?.[k])).map(k => [k, value[k]]));
export function assertLocalMediaCall(name, args) {
  if (!LOCAL_MEDIA_TOOLS.has(name)) throw new Error('Unavailable in the local-media trial.');
  if (args.project_id !== undefined && (!token(args.project_id) || ['.', '..'].includes(args.project_id))) throw new Error('Invalid project ID.');
  if (name === 'proposal_create') {
    const options = args.proposal?.options;
    if (!Array.isArray(options) || !options.length || args.personal_style) throw new Error('Only numeric patch proposals are supported.');
    for (const option of options) {
      if (!Array.isArray(option.operations) || !option.operations.length) throw new Error('Missing patch operations.');
      for (const op of option.operations) {
        if (Object.keys(op).some(k => !['element_id', 'patch', 'rationale'].includes(k)) || !token(op.element_id) || !op.patch ||
            !Object.keys(op.patch).length || Object.entries(op.patch).some(([k,v]) => !numericFields.includes(k) || !Number.isFinite(v))) {
          throw new Error('Only numeric patches to existing elements are supported.');
        }
      }
    }
  }
}
export function localMediaResult(name, value) {
  // Construct results from audited scalar fields; never recursively pass through arbitrary strings or blobs.
  if (name === 'library_status') return { projects: (value.projects ?? []).slice(0,100).map(p => ({id:token(p.id)})).filter(p=>p.id) };
  if (name === 'timeline_get') return { revision: /^[a-f0-9]{64}$/.test(value.revision) ? value.revision : undefined,
    elements: (value.elements ?? []).map(e => ({id:token(e.id), ...numbers(e)})).filter(e=>e.id),
    notice: 'Metadata only. Watch footage and choose clips in the local editor.' };
  if (name === 'editor_open') {
    const url = new URL(value.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password ||
        !/^\/(?:p\/[a-zA-Z0-9._-]+(?:\/storyboard)?|__dreamcut\/[^?#]*)?$/.test(url.pathname)) throw new Error('Invalid editor link.');
    return {url:url.href, notice:'Open this link yourself in your browser. Do not ask the agent to inspect or screenshot it.'};
  }
  if (name === 'editing_feedback_check') return {unaccounted_feedback_ids:(value.unaccounted_feedback_ids??[]).map(token).filter(Boolean)};
  if (name === 'proposal_create') return { staged:true, notice:'Review in the local editor. Nothing has been applied.' };
  if (name === 'editing_feedback_record' || name === 'editing_feedback_disposition') return {event_id:token(value.event_id)};
  throw new Error('No audited result projection.');
}
export function localMediaFailure() {
  return {isError:true,content:[{type:'text',text:'LOCAL_MEDIA_RESTRICTED_OR_FAILED: This request is unavailable or failed. Check the local editor before retrying a write; no media or internal error details are returned.'}]};
}
