import * as ambisonics from 'ambisonics';
import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;

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
        this.ambisonicOrder = 3;
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

        // load HOA audio file
        var soundUrl = "sounds/HOA3_rec4.wav";
        var loader_sound = new ambisonics.HOAloader(audioContext, this.ambisonicOrder, soundUrl, (bufferSound) => { 
            this.hoaSoundBuffer = bufferSound;
        });
        loader_sound.load();

        // rotator is used to rotate the ambisonic scene (listener aim)
        this.rotator = new ambisonics.sceneRotator(audioContext, this.ambisonicOrder);

        // connect graph
        this.rotator.out.connect(this.decoder.in);
        this.decoder.out.connect(this.gainOut);
        this.gainOut.connect(audioContext.destination);

        // local attributes
        this.listenerAimOffset = {azim:0, elev:0};
        this.lastListenerAim = {azim:0, elev:0};
        this.src = audioContext.createBufferSource();

    }

    // play audio 
    start(loop = true) {
        
        if( this.hoaSoundBuffer === undefined ){
            console.warn('cannot start ambisonicPlayer, still loading HOA buffer');
            return
        }

        // create audio source
        this.src = audioContext.createBufferSource();
        this.src.buffer = this.hoaSoundBuffer;
        this.src.loop = loop;

        // connect graph
        this.src.connect(this.rotator.in);

        // play source
        this.src.start(0);
    }

    // stop audio
    stop(){
        this.src.stop();
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
