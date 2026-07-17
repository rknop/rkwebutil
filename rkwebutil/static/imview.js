import { rkWebUtil } from "./rkwebutil.js"

class ImView {
    // data is stored in column-major format, like a FITS image.  It must be
    //   a DataView with little-endian float32 data.
    //   (Why little-endian?  Because that's native where I usually work.)
    // The assumption is that pixel (0,0) is the lower-left,
    //    which is backwards from html display

    // data must be a Float32Array

    // scale is in display pixels per data pixel

    static numImViews = 0;

    constructor( inparams={} ) {
        var self = this;
        let hbox, vbox, but;

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
                        "max": null,
                        "name": null
                      };
        Object.assign( this.params, inparams )
        for ( let field of [ 'data', 'width', 'height', 'dispwidth', 'dispheight',
                             'x0', 'y0', 'scale', 'parent', 'min', 'max', 'name' ] ) {
            this[field] = this.params[field]
        }
        if ( this.name == null ) {
            this.name = "imview-" + ImView.numImViews.toString();
        }
        ImView.numImViews += 1;

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

        this.div = rkWebUtil.elemaker( "div", this.parent );
        // ...I must be overdoing this.  There must be a better way to get the flexbox model
        //   do what I want.
        let tophbox = rkWebUtil.elemaker( "div", this.div, { "classes": [ "hbox", "justifyleft" ] } );
        vbox = rkWebUtil.elemaker( "div", tophbox, { "classes": [ "imview_topdiv" ] } );

        this.infodiv = rkWebUtil.elemaker( "div", vbox, { "classes": [ 'hbox', 'justifycenter' ] } );
        rkWebUtil.elemaker( "span", this.infodiv, { "text": "x:", "classes": [ 'bold' ] } );
        this.xwidget = rkWebUtil.elemaker( "input", this.infodiv, { "attributes": { 'size': 8,
                                                                                    'readonly': 1 } } );
        rkWebUtil.elemaker( "span", this.infodiv, { "text": "  y:", "classes": [ 'bold' ] } );
        this.ywidget = rkWebUtil.elemaker( "input", this.infodiv, { "attributes": { 'size': 8,
                                                                                    'readonly': 1 } } );
        rkWebUtil.elemaker( "span", this.infodiv, { "text": "  value:", "classes": [ 'bold' ] } );
        this.valwidget = rkWebUtil.elemaker( "input", this.infodiv, { "attributes": { 'size': 10,
                                                                                      'readonly': 1 } } );

        hbox = rkWebUtil.elemaker( "div", vbox, { "classes": [ "hbox", "justifyleft" ] } );
        this.canvasdiv = rkWebUtil.elemaker( "div", hbox, { "classes": [ 'imview_canvasdiv' ] } );
        this.canvaswrapper = rkWebUtil.elemaker( "div", this.canvasdiv, { "classes": [ "imview_canvaswrapper" ] } );
        this.canvaswrapper.style.width = this.dispwidth.toString() + "px";
        this.canvaswrapper.style.height = this.dispheight.toString() + "px";
        this.canvas = rkWebUtil.elemaker( "canvas", this.canvaswrapper,
                                          { "attributes": { "width": this.dispwidth,
                                                            "height": this.dispheight },
                                            "classes": [ "imview_canvas" ],
                                          } );
        this.canvas.style.width = this.dispwidth.toString() + "px";
        this.canvas.style.height = this.dispheight.toString() + "px";
        this.canvas.addEventListener( "mouseup", (e) => { self.mouseup(e); } );

        let ns = "http://www.w3.org/2000/svg";

        // Can't use rkWebUtil.elemaker because we need createElementNS
        this.svg = document.createElementNS( ns, "svg" );
        this.svg.setAttributeNS( 'http://www.w3.org/2000/xmlns/', "xmlns", ns );
        this.svg.classList.add( "imview_svg" );
        this.svg.style.width = this.dispwidth.toString() + "px";
        this.svg.style.height = this.dispheight.toString() + "px";
        this.svg.setAttribute( "width", this.dispwidth );
        this.svg.setAttribute( "height", this.dispheight );
        this.svg.setAttribute( "viewBox", "0 0 " + this.dispwidth + " " + this.dispheight );
        this.svg.setAttribute( "id", this.name + "-svg" );
        this.canvaswrapper.appendChild( this.svg );

        let buttondiv = rkWebUtil.elemaker( "div", vbox, { "classes": [ 'hbox', 'justifycenter' ] } );
        rkWebUtil.elemaker( "span", buttondiv, { "text": "min:", "classes": [ 'bold' ] } );
        this.minwidget = rkWebUtil.elemaker( "input", buttondiv,
                                             { "attributes": { "value": rkWebUtil.floatToString( this.min ),
                                                               "size": 10 },
                                               "change": function() { self.set_stretch_and_render(); },
                                               "classes": [ 'outsetborder' ] } );
        rkWebUtil.elemaker( "span", buttondiv, { "text": "  max:", "classes": [ 'bold' ] } );
        this.maxwidget = rkWebUtil.elemaker( "input", buttondiv,
                                             { "attributes": { "value": rkWebUtil.floatToString( this.max ),
                                                               "size": 10 },
                                               "change": function() { self.set_stretch_and_render(); },
                                               "classes": [ 'outsetborder' ] } );
        but = rkWebUtil.button( buttondiv, "Redraw", function() { self.set_stretch_and_render(); } );
        but.classList.add( "marginleftex" );

        buttondiv = rkWebUtil.elemaker( "div", vbox, { "classes": [ 'hbox', 'justifycenter' ] } );
        rkWebUtil.button( buttondiv, "Reset Zoom", function() { self.reset_zoom(); } );
        but = rkWebUtil.button( buttondiv, "Zoom Full", function() { self.zoom_full(); } );
        but.classList.add( "marginleftex" );
        but = rkWebUtil.button( buttondiv, "Zoom In", function() { self.zoom_in(); } );
        but.classList.add( "marginleftex" );
        but = rkWebUtil.button( buttondiv, "Zoom Out", function() { self.zoom_out(); } );
        but.classList.add( "marginleftex" );

        this.ctx = this.canvas.getContext( "2d" );
        this.render_image();

        this.zoombox = null;
        this.zooming = false;
        this.initmousex = -99999;
        this.initmousey = -99999;
        this.canvas.addEventListener( "mousedown", (e) => { self.mousedown(e) } );
        this.mousemovecallback = function(e) { self.mousemove(e); };
        this.dragging = false;
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


    zoom_full() {
        if ( ( this.dispheight / this.height ) < ( this.dispwidth / this.width ) ) {
            this.scale = this.dispheight / this.height;
        }
        else {
            this.scale = this.dispwidth / this.width;
        }
        this.x0 = ( this.width / 2. ) - ( this.dispwidth / 2. / this.scale );
        this.y0 = ( this.height / 2. ) - ( this.dispheight / 2. / this.scale );
        this.render_image();
    }


    zoom_out() {
        this.scale /= 2.;
        this.x0 -= this.dispwidth / 4. / this.scale;
        this.y0 -= this.dispheight / 4. / this.scale;
        this.render_image();
    }


    zoom_in() {
        this.x0 += this.dispwidth / 4. / this.scale;
        this.y0 += this.dispheight / 4. / this.scale;
        this.scale *= 2.;
        this.render_image();
    }


    set_stretch_and_render() {
        this.min = parseFloat( this.minwidget.value );
        this.max = parseFloat( this.maxwidget.value );
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

        rkWebUtil.wipeDiv( this.svg );
        this.zoombox = null;

        let ns = "http://www.w3.org/2000/svg";
        let svgstyle = document.createElementNS( ns, "style" );
        this.svg.appendChild( svgstyle );
        svgstyle.appendChild( document.createTextNode( ".greenbox-" + this.name +
                                                       " { fill: none; stroke: #00cc00; stroke-width: 2; }" ) );

        // ****
        // let rect = document.createElementNS( ns, "rect" );
        // rect.setAttribute( "class", "greenbox-" + this.name );
        // rect.setAttribute( "x", 200 );
        // rect.setAttribute( "y", 250 );
        // rect.setAttribute( "width", 200 );
        // rect.setAttribute( "height", 100 );
        // this.svg.appendChild( rect );
        // ****

    }


    canvasclick( evt ) {
        let rect = evt.target.getBoundingClientRect();
        let padw = evt.target.clientWidth - evt.target.scrollWidth;
        let padh = evt.target.clientHeight - evt.target.scrollHeight;
        let dispx = evt.clientX - rect.left - padw;
        let dispy = evt.clientY - rect.top - padh;
        // console.log( "Clicked at (" + dispx.toString() + ", " + dispy.toString() + ")" );
    }

    mousedown( evt ) {
        let self = this;

        if ( this.zoombox != null ) {
            this.svg.removeChild( this.zoombox );
            this.zoombox = null;
        }
        this.zooming = false;
        let rect = evt.target.getBoundingClientRect();
        let padw = evt.target.clientWidth - evt.target.scrollWidth;
        let padh = evt.target.clientHeight - evt.target.scrollHeight;
        let dispx = evt.clientX - rect.left - padw;
        let dispy = evt.clientY - rect.top - padh;
        this.initmousex = dispx;
        this.initmousey = dispy;
        this.canvas.addEventListener( "mousemove", this.mousemovecallback );
        this.dragging = true;
    }

    mousemove( evt ) {
        if ( ! this.dragging ) return;

        let self = this;
        let rect = evt.target.getBoundingClientRect();
        let padw = evt.target.clientWidth - evt.target.scrollWidth;
        let padh = evt.target.clientHeight - evt.target.scrollHeight;
        let dispx = evt.clientX - rect.left - padw;
        let dispy = evt.clientY - rect.top - padh;

        if ( ! this.zooming ) {
            // ...what's a good minimum number of pixels moved to detect a zoom?
            if ( ( dispx - this.initmousex > 5 ) || ( dispy - this.initmousey > 5 ) )
                this.zooming = true;
        }

        if ( this.zooming ) {
            if ( this.zoombox != null ) {
                this.svg.removeChild( this.zoombox );
            }
            let ns = "http://www.w3.org/2000/svg";
            this.zoombox = document.createElementNS( ns, "rect" );
            this.zoombox.setAttribute( "class", "greenbox-" + this.name );
            let x0 = this.initmousex;
            if ( dispx < this.initmousex ) x0 = dispx;
            let y0 = this.initmousey;
            if ( dispy < this.initmousey ) y0 = dispy;
            let width = Math.abs( dispx - this.initmousex );
            let height = Math.abs( dispy - this.initmousey );
            this.zoombox.setAttribute( "x", x0 );
            this.zoombox.setAttribute( "y", y0 );
            this.zoombox.setAttribute( "width", width );
            this.zoombox.setAttribute( "height", height );
            this.svg.appendChild( this.zoombox );
        }
    }

    mouseup( evt ) {
        if ( this.dragging ) {
            this.canvas.removeEventListener( "mousemove", this.mousemovecallback );
            this.dragging = false;
        }

        let rect = evt.target.getBoundingClientRect();
        // ...it seems like there ought to be a simpler javasript thing that says
        //   "get me the position not iuncluding padding"
        // (...though, in my case, I think the canvas has no padding, so some of
        // this is gratuitous!)
        let padw = evt.target.clientWidth - evt.target.scrollWidth;
        let padh = evt.target.clientHeight - evt.target.scrollHeight;
        let dispx = evt.clientX - rect.left - padw;
        let dispy = evt.clientY - rect.top - padh;

        if ( this.zooming ) {
            this.zooming = false;
            let imgx0 = this.initmousex / this.scale + this.x0;
            let imgy0 = ( this.dispheight - this.initmousey ) / this.scale + this.y0;
            let imgx1 = dispx / this.scale + this.x0;
            let imgy1 = ( this.dispheight - dispy ) / this.scale + this.y0;
            let ctrx = ( imgx0 + imgx1 ) / 2.;
            let ctry = ( imgy0 + imgy1 ) / 2.;
            let width = Math.abs( imgx1 - imgx0 );
            let height = Math.abs( imgy1 - imgy0 );
            if ( ( this.dispehight / height ) < ( this.dispwidth / width ) ) {
                this.scale = this.dispheight / height;
            } else {
                this.scale = this.dispwidth / width;
            }
            this.x0 = ctrx - this.dispwidth / 2. / this.scale;
            this.y0 = ctry - this.dispheight / 2. / this.scale;
            this.render_image();
        }
        else {
            let imgx = dispx / this.scale + this.x0;
            let imgy = ( this.dispheight - dispy ) / this.scale + this.y0;
            this.xwidget.value = imgx.toFixed( 2 );
            this.ywidget.value = imgy.toFixed( 2 );
            imgx = Math.round( imgx );
            imgy = Math.round( imgy );
            if ( ( imgx < 0 ) || ( imgx >= this.width ) || ( imgy < 0 ) || ( imgy >= this.height ) ) {
                this.valwidget.value = "";
            }
            else {
                this.valwidget.value = rkWebUtil.floatToString(
                    this.data.getFloat32( 4 * ( imgy * this.width + imgx ), true ),
                    4 );
            }

            // If shift-click, or if middle-click, then recenter
            if ( ( ( evt.button == 0 ) && ( evt.shiftKey ) ) || ( evt.button == 1 ) ) {
                this.x0 = imgx - this.dispwidth / 2. / this.scale;
                this.y0 = imgy - this.dispheight / 2. / this.scale;
                this.render_image();
            }
        }
    }
}

// **********************************************************************

export { ImView }
