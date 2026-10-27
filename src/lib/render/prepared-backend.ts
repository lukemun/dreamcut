import type {PreparedPreviewInput} from '../timeline/prepared-preview';
/** Backend adapter for the shared prepared renderer. Scheduling, caching, encoding
 * and delivery are backend-independent. Audio always keeps its original authority. */
export function preparedBackendOptions(input:PreparedPreviewInput,project:string,audioOnly:boolean) {
 return {nativeProjectId:input.backend==='rust'&&!audioOnly?project:undefined};
}
