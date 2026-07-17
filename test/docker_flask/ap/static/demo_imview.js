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
        let self = this;
        let dv = new DataView( data );
        let height = dv.getUint16( 0, true );
        let width = dv.getUint16( 2, true );
        let image = new DataView( data, 4 );
        this.imview = new ImView( { "data": image,
                                    "width": width,
                                    "height": height,
                                    "parent": this.parent,
                                    "clickcallback": (x,y) => { self.addsquare(x,y) }
                                  } );
    }

    addsquare( imgx, imgy ) {
        this.imview.addsquare( imgx, imgy );
    }

}

// **********************************************************************

export { demo_imview }
