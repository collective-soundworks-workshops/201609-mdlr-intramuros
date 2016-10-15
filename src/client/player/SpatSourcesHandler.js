import * as ambisonics from 'ambisonics';
import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;

export default class SpatSourcesHandler {
    constructor(bufferSources) {

        // create ambisonic decoder (common to all sources)
        this.ambisonicOrder = 3;
        this.decoder = new ambisonics.binDecoder(audioContext, this.ambisonicOrder);

        // load HOA to bianural filters in decoder
        var irUrl = "IRs/HOA3_filters_virtual.wav";
        var loader_filters = new ambisonics.HOAloader(audioContext, this.ambisonicOrder, irUrl, (bufferIr) => { this.decoder.updateFilters(bufferIr); } );
        loader_filters.load();
        
        // master gain out
        this.gainOut = audioContext.createGain();
        this.gainOut.gain.value = 1.0;

        // connect graph
        this.decoder.out.connect(this.gainOut);
        this.gainOut.connect(audioContext.destination);

        // local attributes
        this.sourceMap = new Map();
        this.buffers = bufferSources;
    }

    // init and start spat source. id is audio buffer id in loader service
    startSource(id, initAzim = 0, initElev = 0, loop = true) {
        console.log(id)
        
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

    // set source id pos
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
    setListenerAim(azim, elev){

        // for each spat source in local map
        this.sourceMap.forEach((spatSrc, key) => {
        
            // set new encoder azim / elev (relative to current source pos)
            spatSrc.enc.azim = spatSrc.azim - azim;
            spatSrc.enc.elev = spatSrc.elev - elev;
        
            // update encoder gains (apply azim / elev mod)
            spatSrc.enc.updateGains();
        });
    }

}
