import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;


export default class AudioPlayer {
    constructor(bufferSources) {
        
        // master gain out
        this.gainOut = audioContext.createGain();
        this.gainOut.gain.value = 1.0;

        // connect graph
        this.gainOut.connect(audioContext.destination);

        // local attributes
        this.sourceMap = new Map();
        this.buffers = bufferSources;
    }

    stopSource(id, fadeOutDuration = 0){

        if( !this.sourceMap.has(id) ){
            console.warn('failed to stop source', id, 'in AudioPlayer (source never started)');
            return
        }
            

        // get source
        let srcObj = this.sourceMap.get(id);

        // fade out
        const param = srcObj.gain.gain;
        const now = audioContext.currentTime;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(0.0, now + fadeOutDuration);

        // stop when fade out over
        srcObj.src.stop(now + fadeOutDuration);

        // remove from local
        this.sourceMap.delete(id);        
    }

    // init and start spat source. id is audio buffer id in loader service
    startSource(id, fadeInDuration = 0, loop = true) {
        
        if( this.buffers[id] == undefined ){
            console.warn('wrong file index', id, 'in AudioPlayer');
            return
        }

        // create audio source
        var src = audioContext.createBufferSource();
        src.buffer = this.buffers[id];
        src.loop = loop;

        // create fadeIn gain
        let gain = audioContext.createGain();
        gain.gain.value = 0.0;
        gain.gain.setValueAtTime(gain.gain.value, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(1.0, audioContext.currentTime + fadeInDuration);

        // connect graph
        src.connect(gain);
        gain.connect(this.gainOut);

        console.log('start', id)
        
        // play source
        src.start(0);

        // store new spat source
        this.sourceMap.set(id, {src:src, gain:gain});
    }
}
