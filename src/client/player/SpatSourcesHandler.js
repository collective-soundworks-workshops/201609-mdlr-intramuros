import * as ambisonics from 'ambisonics';
import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;

export default class SpatSourcesHandler {
    constructor(buffer) {
        // create ambisonic encoder / decoder
        this.ambisonicOrder = 3;
        this.encoder = new ambisonics.monoEncoder(audioContext, this.ambisonicOrder);
        this.decoder = new ambisonics.binDecoder(audioContext, this.ambisonicOrder);
        this.gainOut = audioContext.createGain();
        this.gainOut.gain.value = 1.0;

        // connect graph
        this.encoder.out.connect(this.decoder.in);
        this.decoder.out.connect(this.gainOut);
        this.gainOut.connect(audioContext.destination);

        // load HOA to bianural filters in decoder
        var irUrl = "IRs/HOA3_filters_virtual.wav";
        var loader_filters = new ambisonics.HOAloader(audioContext, this.ambisonicOrder, irUrl, (buffer) => { this.decoder.updateFilters(buffer); } );
        loader_filters.load();

        // add constant source
        this.playSound(buffer, true);
    }

    // load filters and assign to buffers
    assignFiltersOnLoad (buffer) {
        this.decoder.updateFilters(buffer);
    }

    playSound(buffer, loop = false) {
        // create source
        var src = audioContext.createBufferSource();
        src.buffer = buffer;
        src.loop = loop;

        // connect graph
        src.connect(this.encoder.in);

        // play source
        src.start(0);
    }

    setSourcePos(azim, elev) {
        this.encoder.azim = azim;
        this.encoder.elev = elev;
        this.encoder.updateGains();
    }

}
