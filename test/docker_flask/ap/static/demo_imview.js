import { rkWebUtil } from "./rkwebutil.js";
import { ImView } from "./imview.js";


class demo_imview {
    constructor() {
        this.parent = document.getElementById( "main-div" );
    }

    init() {
        var self = this;
        this.connector = new rkWebUtil.Connector( "/" );
        this.connector.sendHttpRequestGetRaw( "gimmeimage", {},
                                              function(d) { self.showimage(d) },
                                              function(e) { self.omg(e) } );
    }        
    
    omg() {
        window.alert( "Bad things have happened." );
    }

    showimage( data ) {
        console.log( "Got data, length " + data.byteLength );
        let dv = new DataView( data );
        let height = dv.getUint16( 0, true );
        let width = dv.getUint16( 2, true );
        let image = new DataView( data, 4 );
        this.imview = new ImView( { "data": image,
                                    "width": width,
                                    "height": height,
                                    "parent": this.parent
                                  } );
    }
        
}

// **********************************************************************

export { demo_imview }
