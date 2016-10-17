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
        

        // connect graph
        this.decoder.out.connect(this.gainOut);
        this.gainOut.connect(audioContext.destination);

        // local attributes
        this.sourceMap = new Map();
        this.listenerAimOffset = {azim:0, elev:0};
        this.lastListenerAim = {azim:0, elev:0};
        this.buffers = bufferSources;
    }

    // start all sources
    start(){
        for( let i = 0; i < this.buffers.length; i ++ ){
          let initAzim = (360 / this.buffers.length) * i; // equi on circle
          this.startSource(i, initAzim);
        }        
    }

    // stop all sources
    stop(){
        this.sourceMap.forEach((spatSrc, key) => {
            spatSrc.src.stop();
        });
    }

    // init and start spat source. id is audio buffer id in loader service
    startSource(id, initAzim = 0, initElev = 0, loop = true) {
        
        // check for valid audio buffer
        if( this.buffers[id] === undefined ){
            console.warn('spat source id', id, 'corresponds to empty loader.buffer, source creation aborted');
            return
        }

        // create audio source
        var src = audioContext.createBufferSource();
        src.buffer = this.buffers[id];
        src.loop = loop;

        // create encoder (source-specific to be able to set source-specific position latter)
        let encoder = new ambisonics.monoEncoder(audioContext, this.ambisonicOrder);

        // connect graph
        src.connect(encoder.in);
        encoder.out.connect(this.decoder.in);

        // play source
        src.start(0);

        // store new spat source
        this.sourceMap.set(id, {src:src, enc:encoder, azim:initAzim, elev:initElev});
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

    // set listener aim / orientation (i.e. move all sources around)
    setListenerAim(azim, elev = undefined){

        // for each spat source in local map
        this.sourceMap.forEach((spatSrc, key) => {
        
            // set new encoder azim / elev (relative to current source pos)
            spatSrc.enc.azim = spatSrc.azim - (azim - this.listenerAimOffset.azim);
            this.lastListenerAim.azim = azim;
            if( elev !== undefined ){
                spatSrc.enc.elev = spatSrc.elev - (elev - this.listenerAimOffset.elev);
                this.lastListenerAim.elev = elev;
            }
        
            // update encoder gains (apply azim / elev mod)
            spatSrc.enc.updateGains();
        });
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
