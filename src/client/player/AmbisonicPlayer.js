import * as ambisonics from 'ambisonics';
import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;

// list of Ambisonic files to load
const hoaAudioFiles = [
    // 'sounds/HOA3_rec4.wav',
    // 'sounds/BF_rec2.wav',
    // 'sounds/BF_rec4.wav',
    // 'sounds/BF_rec5.wav'
    'sounds/FranceInfo_Cabine_Ambi_01_truncated.wav',
    'sounds/FranceInfo_Regie_Ambi_01_truncated.wav',
    'sounds/Hall_Ambi_01_truncated.wav',
    'sounds/BF_rec2.wav',
];

/**
* Spherical coordinate system
* azim stands for azimuth, horizontal angle (eyes plane), 0 is facing forward, clockwise +
* elev stands for elevation, vertical angle (mouth-nose plane), 0 is facing forward, + is up
**/

export default class AmbisonicPlayer {
    constructor(roomReverb = false) {
        
        // master gain out
        this.gainOut = audioContext.createGain();
        this.gainOut.gain.value = 10.0;

        // create ambisonic decoder (common to all sources)
        this.ambisonicOrder = 1;
        this.decoder = new ambisonics.binDecoder(audioContext, this.ambisonicOrder);

        // load HOA to binaural filters in decoder
        var irUrl = 'IRs/HOA3_filters_virtual.wav';
        if( roomReverb ){
            // different IR for reverb (+ gain adjust for iso-loudness)
            irUrl = 'IRs/room-medium-1-furnished-src-20-Set1_16b.wav';
            this.gainOut.gain.value *= 0.5;
        }
        var loader_filters = new ambisonics.HOAloader(audioContext, this.ambisonicOrder, irUrl, (bufferIr) => { 
            this.decoder.updateFilters(bufferIr); 
        });
        loader_filters.load();

        // load HOA audio files
        this.hoaSoundBuffer = [];
        hoaAudioFiles.forEach((audioFileName, audioFileIndex) => {
            let soundUrl = audioFileName;
            console.log(audioFileIndex, audioFileName);
            let loader_sound = new ambisonics.HOAloader(audioContext, this.ambisonicOrder, soundUrl, (bufferSound) => { 
                this.hoaSoundBuffer[audioFileIndex] = bufferSound;
                // catch up if a start / some starts was / were already requested while loading
                this.bufferedStartInfo.forEach((bufferedInfo, index)=>{
                    if( bufferedInfo.fileId == audioFileIndex ){
                        this.startSource(bufferedInfo.fileId, bufferedInfo.loop, bufferedInfo.fadeInDuration);
                        this.bufferedStartInfo.splice(index, 1); // remove from array
                    }
                });
            });
            loader_sound.load();
        });

        // rotator is used to rotate the ambisonic scene (listener aim)
        this.rotator = new ambisonics.sceneRotator(audioContext, this.ambisonicOrder);

        // connect graph
        this.rotator.out.connect(this.decoder.in);
        this.decoder.out.connect(this.gainOut);
        this.gainOut.connect(audioContext.destination);

        // local attributes
        this.listenerAimOffset = {azim:0, elev:0};
        this.lastListenerAim = {azim:0, elev:0};
        this.srcMap = new Map();
        this.src = audioContext.createBufferSource();
        this.bufferedStartInfo = [{fileId:-1, loop:true}];

    }

    // play audio 
    startSource(fileId, loop = true, fadeInDuration = 0) {
        
        // wrong index
        if ( (fileId < 0) || (fileId > (hoaAudioFiles.length - 1)) ){
            console.warn('wrong file index', fileId, 'in AmbisonicPlayer');
            return
        }

        // its too early (file not loaded yet)
        if( this.hoaSoundBuffer[fileId] === undefined ){
            console.warn('cannot yet start ambisonicPlayer, file:', hoaAudioFiles[fileId], 'awaiting for file to finish loading...');
            this.bufferedStartInfo.push({fileId:fileId, loop:loop, fadeInDuration:fadeInDuration});
            return
        }

        // create audio source
        let src = audioContext.createBufferSource();
        src.buffer = this.hoaSoundBuffer[fileId];
        src.loop = loop;

        // create fadeIn gain
        let gain = audioContext.createGain();
        gain.gain.value = 0.0;
        // gain.gain.cancelScheduledValues(audioContext.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(1.0, audioContext.currentTime + fadeInDuration);        

        // connect graph
        src.connect(gain);
        gain.connect(this.rotator.in);

        // play source
        src.start(0);

        // store
        this.srcMap.set(fileId, {src:src, gain:gain});

    }

    // stop audio
    stop(fileId = -1, fadeOutDuration = 0){

        // stop all
        if( fileId = -1 ){
            this.srcMap.forEach((srcObj, key) => {
                this.stopSource(key, fadeOutDuration);
            });
        }
        else{
            this.stopSource(fileId, fadeOutDuration);
        }

    }

    stopSource(fileId, fadeOutDuration){
        // get source
        let srcObj = this.srcMap.get(fileId);

        // fade out
        const param = srcObj.gain.gain;
        const now = audioContext.currentTime;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(0.0, now + fadeOutDuration);

        // stop when fade out over
        srcObj.src.stop(now + fadeOutDuration);

        // remove from local
        this.srcMap.delete(fileId);
    }

    // set listener aim / orientation
    setListenerAim(azim, elev = undefined){
        
        // update rotator yaw / pitch
        this.rotator.yaw = azim - this.listenerAimOffset.azim;
        this.lastListenerAim.azim = azim;
        if( elev !== undefined ){
            this.rotator.pitch = elev - this.listenerAimOffset.elev;
            this.lastListenerAim.elev = elev;
        }

        // update rotator coefficients (take into account new yaw / pitch)
        this.rotator.updateRotMtx();
    }

    // set listener aim offset (e.g. to "reset" orientation)
    resetListenerAim(azimOnly = true){

        // save new aim values
        this.listenerAimOffset.azim = this.lastListenerAim.azim;
        if( ! azimOnly ){
            this.listenerAimOffset.elev = this.lastListenerAim.azim;
        }

        // update listener aim (update encoder gains, useless when player constantly stream deviceorientation data)
        this.setListenerAim(this.lastListenerAim.azim, this.lastListenerAim.elev);
    }

}
