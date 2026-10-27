export function nativePreparationFrame(input:{frame:number;durationInFrames:number;fps:number;playbackRate:number;latencyMs:number;playing:boolean;hasCurrentScene:boolean}){
 if(!input.playing||!input.hasCurrentScene)return input.frame;
 const lead=Math.min(3,Math.max(1,Math.ceil(input.latencyMs*input.fps*input.playbackRate/1000)));
 return Math.min(input.durationInFrames-1,input.frame+lead);
}
export function nativePresentationAction(input:{frame:number;preparedFrame:number;ready:boolean;transportPlaying:boolean;current:boolean}):'discard'|'wait'|'present'|'buffer'{
 if(!input.current)return 'discard';
 if(!input.transportPlaying&&input.preparedFrame!==input.frame)return 'discard';
 if(input.ready)return input.preparedFrame<=input.frame?'present':'wait';
 return input.preparedFrame<=input.frame?'buffer':'wait';
}
