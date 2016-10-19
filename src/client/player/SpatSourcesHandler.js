import * as ambisonics from 'ambisonics';
import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;

/**
* Spherical coordinate system
* azim stands for azimuth, horizontal angle (eyes plane), 0 is facing forward, clockwise +
* elev stands for elevation, vertical angle (mouth-nose plane), 0 is facing forward, + is up
**/

export default class SpatSourcesHandler {
    constructor(bufferSources, roomReverb = false) {
        
        // master gain out
        this.gainOut = audioContext.createGain();
        this.gainOut.gain.value = 0.5;

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

        var loader_filters = new ambisonics.HOAloader(audioContext, this.ambisonicOrder, irUrl, (bufferIr) => { this.decoder.updateFilters(bufferIr); } );
        loader_filters.load();
        
        // rotator is used to rotate the ambisonic scene (listener aim)
        this.rotator = new ambisonics.sceneRotator(audioContext, this.ambisonicOrder);

        // connect graph
        this.rotator.out.connect(this.decoder.in);
        this.decoder.out.connect(this.gainOut);
        this.gainOut.connect(audioContext.destination);

        // local attributes
        this.sourceMap = new Map();
        this.listenerAimOffset = {azim:0, elev:0};
        this.lastListenerAim = {azim:0, elev:0};
        this.buffers = bufferSources;
    }

    // start all sources
    startAll(){
        for( let i = 0; i < this.buffers.length; i ++ ){
          let initAzim = (180 / this.buffers.length) * i - 90; // equi on hemi-circle
          this.startSource(i, initAzim, 0, true, 0.0);
        }
    }

    // stop all sources
    stop(id = -1, fadeOutDuration = 0){

        // stop all
        if( fileId = -1 ){
            this.sourceMap.forEach((srcObj, key) => {
                this.stopSource(key, fadeOutDuration);
            });
        }
        else{
            this.stopSource(id, fadeOutDuration);
        }
    }

    stopSource(id, fadeOutDuration = 0){

        if( !this.sourceMap.has(id) )
            return

        // get source
        let srcObj = this.srcMap.get(id);

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
    startSource(id, initAzim = 0, initElev = 0, loop = true, fadeInDuration = 0) {
        
        // check for valid audio buffer
        if( this.buffers[id] === undefined ){
            console.warn('spat source id', id, 'corresponds to empty loader.buffer, source creation aborted');
            return
        }

        // create audio source
        var src = audioContext.createBufferSource();
        src.buffer = this.buffers[id];
        src.loop = loop;
        console.log('start', fadeInDuration);
        // create encoder (source-specific to be able to set source-specific position latter)
        let encoder = new ambisonics.monoEncoder(audioContext, this.ambisonicOrder);

        // create fadeIn gain
        let gain = audioContext.createGain();
        gain.gain.value = 0.0;
        gain.gain.setValueAtTime(gain.gain.value, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(1.0, audioContext.currentTime + fadeInDuration);

        // connect graph
        src.connect(gain);
        gain.connect(encoder.in);
        encoder.out.connect(this.rotator.in);

        // play source
        src.start(0);

        // store new spat source
        this.sourceMap.set(id, {src:src, enc:encoder, gain:gain, azim:initAzim, elev:initElev});
    }

    // set source id position
    setSourcePos(id, azim, elev) {

        // check if source has been initialized (added to local map)
        if( this.sourceMap.has(id) ){

            // get spat source
            let spatSrc = this.sourceMap.get(id);
            
            // set spat source encoder azim / elev values
            spatSrc.enc.azim = azim;
            spatSrc.enc.elev = elev;
            
            // update encoder gains (apply azim / elev mod)
            spatSrc.enc.updateGains();
        }
    }

    // set listener aim / orientation (i.e. rotate ambisonic field)
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
