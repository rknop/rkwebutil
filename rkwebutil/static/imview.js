import { rkWebUtil } from "./rkwebutil.js"

class ImView {
    // data is stored in column-major format, like a FITS image.  It must be
    //   a DataView with little-endian float32 data.
    //   (Why little-endian?  Because that's native where I usually work.)
    // The assumption is that pixel (0,0) is the lower-left,
    //    which is backwards from html display

    // data must be a Float32Array

    // scale is in display pixels per data pixel

    constructor( inparams={} ) {
        var self = this;

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
                        "max": null
                      };
        Object.assign( this.params, inparams )
        for ( let field of [ 'data', 'width', 'height', 'dispwidth', 'dispheight',
                             'x0', 'y0', 'scale', 'parent', 'min', 'max' ] ) {
            this[field] = this.params[field]
        }

        if ( ( this.data == null ) || ( this.width == null ) || ( this.height == null ) ) {
            window.alert( "ImView: must have non-null data, width, and height." )
            return;
        }

        this.ndata = this.width * this.height;

        if ( ! ( this.data instanceof DataView ) ) {
            window.alert( "ImView: data must be a DataView" );
            return;
        }
        if ( this.data.byteLength != ( this.ndata * 4 ) ) {
            window.alert( "Imview: data array length " + this.data.byteLength.toString() +
                          "doesn't match width × height × 4 " + this.width.toString() +
                          " × " + this.height.toString() + " × 4" );
            return;
        }

        let tot = 0.;
        let tot2 = 0.;
        let n = 0;
        for ( let i = 0 ; i < this.ndata ; ++i ) {
            let val = this.data.getFloat32( 4*i, true )
            if ( ! isNaN(val) ) {
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
            this.sdev = Math.sqrt( ( tot2 / n ) - ( this.mean * this.mean ) );
        }

        this.init_min = this.min;
        this.init_max = this.max;
        if ( this.init_min == null ) {
            this.init_min = this.mean - 5. * this.sdev;
        }
        if ( this.init_max == null ) {
            this.init_max = this.mean + 5. * this.sdev;
        }
        this.min = this.init_min;
        this.max = this.init_max;

        this.init_scale = this.scale;
        this.init_x0 = this.x0;
        this.init_y0 = this.y0;
        if ( this.init_scale == null ) {
            if ( ( this.dispheight / this.height ) < ( this.dispwidth / this.width ) ) {
                this.init_scale = this.dispheight / this.height;
            }
            else {
                this.init_scale = this.dispwidth / this.width;
            }
        }
        this.scale = this.init_scale;
        if ( this.init_x0 == null ) {
            this.init_x0 = ( this.width / 2. ) - ( this.dispwidth / 2. / this.scale );
        }
        this.x0 = this.init_x0;
        if ( this.init_y0 == null ) {
            this.init_y0 = ( this.height / 2. ) - ( this.dispheight / 2. / this.scale );
        }
        this.y0 = this.init_y0;

        this.div = rkWebUtil.elemaker( "div", this.parent, { "classes": [ 'imview_topdiv' ] } );
        this.infodiv = rkWebUtil.elemaker( "div", this.parent, { "classes": [ 'hbox' ] } );
        rkWebUtil.elemaker( "span", this.infodiv, { "text": "x:", "classes": [ 'bold' ] } );
        this.xwidget = rkWebUtil.elemaker( "span", this.infodiv, { "classes": [ 'insetborder' ],
                                                                   "attributes": { 'width': '10ex' } } );
        rkWebUtil.elemaker( "span", this.infodiv, { "text": "  y:", "classes'": [ 'bold' ] } );
        this.ywidget = rkWebUtil.elemaker( "span", this.infodiv, { "classes": [ 'insetborder' ],
                                                                   "attributes": { 'width': '10ex' } } );
        rkWebUtil.elemaker( "span", this.infodiv, { "text": "  value:", "classes": [ 'bold' ] } );
        this.valwidget = rkWebUtil.elemaker( "span", this.infodiv, { "classes": [ 'insetborder' ],
                                                                     "attributes": { 'width': '12ex' } } );

        this.cavasdiv = rkWebUtil.elemaker( "div", this.div, { "classes": [ 'canvasdiv' ] } );
        this.canvas = rkWebUtil.elemaker( "canvas", this.canvasdiv, { "attributes": { "width": this.dispwidth,
                                                                                      "height": this.dispheight } } );
        this.ctx = this.canvas.getContext( "2d" );

        this.buttondiv = rkWebUtil.elemaker( "div", this.div, { "classes": [ 'hbox' ] } );
        rkWebUtil.elemaker( "span", this.buttondiv, { "text": "min:", "classes": [ 'bold' ] } );
        this.minwidget = rkWebUtil.elemaker( "input", this.buttondiv,
                                             { "text": rkWebUtil.floatToString( this.min ),
                                               "classes": [ 'outsetborder' ] } );
        rkWebUtil.elemaker( "span", this.buttondiv, { "text": "max:", "classes": [ 'bold' ] } );
        this.maxwidget = rkWebUtil.elemaker( "input", this.buttondiv,
                                             { "text": rkWebUtil.floatToString( this.max ),
                                               "classes": [ 'outsetborder' ] } );
        rkWebUtil.button( this.buttondiv, "Redraw", function() { self.render_image() } );

        this.render_image();
    }


    change_stretch( min, max ) {
        this.min = min;
        this.max = max;
        this.render_image();
    }


    reset_stretch() {
        this.min = this.init_min;
        this.max = this.init_max;
        this.render_image();
    }


    reset_zoom() {
        this.scale = this.init_scale;
        this.x0 = this.init_x0;
        this.y0 = this.init_y0;
        this.render_image();
    }


    render_image() {
        // Don't (yet?) support backwards color mapping
        if ( this.max < this.min ) {
            let tmp = this.min;
            this.min = this.max;
            this.max = tmp;
        }

        let imagedata = this.ctx.createImageData( this.dispwidth, this.dispheight );

        // Does javascript have vectorized stuff to make this faster?
        for( let dispy = 0 ; dispy < this.dispheight ; ++dispy ) {
            let off = dispy * this.dispwidth * 4;
            let imgy = Math.round( ( this.dispheight - dispy ) / this.scale + this.y0 );
            let yoffedge = ( imgy < 0 ) || ( imgy >= this.height );
            let lastimgx = -1e32;
            let bval = 0;
            for ( let dispx = 0 ; dispx < this.dispwidth ; ++dispx ) {
                let imgx = 0;
                let offedge = yoffedge;
                if ( ! offedge ) {
                    imgx = Math.round( dispx / this.scale + this.x0 );
                    offedge = ( imgx < 0 ) || ( imgx >= this.width );
                }
                if ( offedge ) {
                    bval = 255;
                }
                else {
                    if ( imgx != lastimgx ) {
                        // Man I hope function calling overhead doesn't kill us here.
                        // With any luck, DataView.getFloat32 is implemented as an inline thing
                        let val = this.data.getFloat32( 4 * ( imgy * this.width + imgx ), true );
                        bval = 0;
                        if ( val > this.min ) {
                            if ( val >= this.max ) {
                                bval = 255;
                            } else {
                                bval = ( val - this.min ) * 255 / ( this.max - this.min );
                            }
                        }
                        if ( isNaN(bval) ) {
                            bval = 0;
                        } else {
                            // I feel very queasy about javascript not having an expicit uint8 type
                            bval = Math.round( bval );
                            if ( bval < 0 ) bval = 0;
                            if ( bval > 255 ) bval = 255;
                        }
                    }
                }
                imagedata.data[ off ] = bval;
                imagedata.data[ off + 1 ] = bval;
                imagedata.data[ off + 2 ] = bval;
                imagedata.data[ off + 3 ] = 255;
                lastimgx = imgx;
                off += 4;
            }
        }

        this.ctx.putImageData( imagedata, 0, 0 );
    }

}

// **********************************************************************

export { ImView }
