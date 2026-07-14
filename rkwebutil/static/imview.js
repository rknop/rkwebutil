import { rkwebUtil } from "./rkwebutil.js"

class ImView {
    // data is stored in column-major format, like a FITS image.
    // The assumption is that pixel (0,0) is the lower-left,
    //    which is backwards from html display

    // data must be a Float32Array

    // scale is in display pixels per data pixel

    constructor( inparams={} ) {
        this.params = { "data": null,
                        "width": null,
                        "height": null,
                        "dispwidth": 600,
                        "dispheight": 600,
                        "x0": null,
                        "y0": null,
                        "scale": null,
                        "parent": null,
                        "min": null,
                        "max" null,

                      };
        Object.assign( this.params, inparams )

        if ( ( this.params.data == null ) || ( this.params.width == null ) || ( this.params.height == null ) ) {
            window.alert( "ImView: must have non-null data, width, and height." )
            return;
        }
        if ( ! ( this.params.data instanceof Float32Array ) ) {
            window.alert( "ImView: data must be a Float32Array" );
            return;
        }
        if ( this.params.data.length != ( this.params.width * this.params.height ) ) {
            window.alert( "Imview: data array length " + this.params.data.length.toString() +
                          "doesn't match width × height " + this.params.width.toString() +
                          " × " + this.params.height.toString() );
            return;
        }

        let tot = 0.;
        let tot2 = 0.;
        let n = 0;
        for ( let val of this.data.values() ) {
            if ( ! isNan(val) ) {
                tot += val;
                tot2 += val * val;
                n += 1;
            }
        }
        if ( n == 0 ) {
            this.mean = 0;
            this.sdev = 1.;
        }
        else {
            this.mean = tot / n;
            this.sdev = Math.sqrt( ( tot2 * tot2 / n ) - ( this.mean * this.mean ) );
        }

        this.init_min = this.params.min;
        this.init_max = this.params.max;
        if ( this.init_min == null ) {
            this.init_min = this.mean - 5. * this.sdev;
        }
        if ( this.init_max == null ) {
            this.init_max = this.mean + 5. * this.sdev;
        }
        this.params.min = this.init_min;
        this.params.max = this.init_max;
        
        this.init_scale = this.params.scale;
        this.init_x0 = this.params.x0;
        this.init_y0 = this.params.y0;
        if ( this.init_scale == null ) {
            if ( ( this.dispheight / this.height ) < ( this.dispwidth / this.width ) ) {
                this.init_scale = this.dispheight / this.height;
            }
            else {
                this.init_scale = this.dispwidth / this.width;
            }
        }
        if ( this.init_x0 == null ) {
            this.init_x0 = ( this.params.width / 2. ) - ( this.params.dispwidth / 2. / this.params.scale );
        }
        if ( this.init_y0 == null ) {
            this.init_y0 = ( this.params.height / 2. ) - ( this.params.dispheight / 2. / this.params.scale );
        }
        this.params.scale = this.init_scale;
        this.params.x0 = this.init_x0;
        this.params.y0 = this.init_y0;

        this.div = rkWebUtil.elemaker( "div", this.params.parent, { "classes": [ 'imview_topdiv' ] } );
        this.canvas = rkWebUtil.elemaker( "canvas", this.div, { "attributes": { "width": this.params.dispwidth,
                                                                                "height": this.params.dispheight } } );
        this.ctx = this.canvas.getContext( "2d" );
        this.imagedata = ctx.createImageData( this.params.dispwidth, this.params.dispheight );

        this.render_image();
    }


    change_stretch( min, max ) {
        this.params.min = min;
        this.params.max = max;
        this.render_image();
    }


    reset_stretch() {
        this.params.min = this.init_min;
        this.params.max = this.init_max;
        this.render_image();
    }
    

    reset_zoom() {
        this.params.scale = this.init_scale;
        this.params.x0 = this.init_x0;
        this.params.y0 = this.init_y0;
        this.render_image();
    }
    
    
    render_image() {
        // Don't (yet?) support backwards color mapping
        if ( this.params.max < this.params.min ) {
            let tmp = this.params.min;
            this.params.min = this.params.max;
            this.params.max = tmp;
        }

        // Does javascript have vectorized stuff to make this faster?
        for( let dispy = 0 ; dispy < this.params.dispheight ; ++dispy ) {
            let off = dispy * this.params.dispwidth * 4;
            let imgy = Math.round( ( this.params.dispheight - dispy ) / this.params.scale + this.params.y0 );
            let offedge == ( imgy < 0 ) || ( imgy >= this.params.height );
            let lastimgx = -1e32;
            let bval = 0;
            for ( let dispx = 0 ; dispx < this.params.dispwidth ; ++dispx ) {
                if ( ! offedge ) {
                    let imgx = Math.round( dispx / this.params.scale + this.params.x0 );
                    offedge = ( imgx < 0 ) || ( imgx >= this.params.width );
                }
                if ( offedge ) {
                    bval = 255;
                }
                else {
                    if ( imgx != lastimgx ) {
                        val = this.params.data.at( imgy * this.params.width + imgx );
                        bval = 0;
                        if ( val > this.params.min ) {
                            if ( val >= this.params.max ) {
                                bval = 255;
                            } else {
                                bval = ( val - this.params.min ) * 255 / ( this.params.max - this.params.min );
                            }
                        }
                        if isNan(bval) {
                            bval = 0;
                        } else {
                            // I feel very queasy about javascript not having an expicit uint8 type
                            bval = Math.round( bval );
                            if ( bval < 0 ) bval = 0;
                            if ( bval > 255 ) bval = 255;
                        }
                    }
                }
                this.imagedata.data[ off ] = bval;
                this.imagedata.data[ off + 1 ] = bval;
                this.imagedata.data[ off + 2 ] = bval;
                this.imagedata.data[ off + 3 ] = 255;
                lastimgx = imgx;
                off += 4;
            }
        }
    }

}
