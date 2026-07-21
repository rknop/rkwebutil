import { rkWebUtil } from "./rkwebutil.js"

class ImView {
    // data is stored in column-major format, like a FITS image.  It must be
    //   a DataView with little-endian float32 data.
    //   (Why little-endian?  Because that's native where I usually work.)
    // The assumption is that pixel (0,0) is the lower-left,
    //    which is backwards from html display

    // scale is in display pixels per data pixel

    static numImViews = 0;
    static numSquares;

    constructor( inparams={} ) {
        var self = this;
        let hbox, vbox, but;

        let defaults = { "data": null,
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
                         "zscale_samples": 10000,
                         "zscale_contrast": 0.25,
                         "name": null,
                         "clickcallback": null
                       };
        let unknown = [];
        for ( let kw in inparams ) if ( ! defaults.hasOwnProperty(kw) ) unknown.push( kw )
        if ( unknown.length > 0 ) {
            window.alert( "ERROR: Unknown parameters passed to ImView: " + unknown.toString() );
            return;
        }
        for ( let param in defaults ) {
            if ( inparams.hasOwnProperty(param) )
                this[param] = inparams[param];
            else
                this[param] = defaults[param];
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
        this.zscale_samples = Math.min( this.zscale_samples, this.ndata );

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

        let tmp = this.zscale( this.zscale_samples, this.zscale_contrast );
        this.zmin = tmp[0];
        this.zmax = tmp[1];

        this.init_min = this.min;
        this.init_max = this.max;
        if ( this.init_min == null ) this.init_min = this.zmin;
        if ( this.init_max == null ) this.init_max = this.zmax;
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

        this.squares = [];
        this.zoombox = null;
        this.zooming = false;
        this.dragging = false;
        this.initmousex = -99999;
        this.initmousey = -99999;
        this.mousemovecallback = function(e) { self.mousemove(e); };

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
        this.canvas.addEventListener( "mousedown", (e) => { self.mousedown(e) } );
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
        but = rkWebUtil.button( buttondiv, "Reset Stretch", function() { self.reset_stretch(); } );
        but.classList.add( "marginleftex" );
        but = rkWebUtil.button( buttondiv, "ZScale", function() { self.zscale_stretch(); } );
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
    }


    // The next three functions where stolen from
    //   https://github.com/spacetelescope/stsci.numdisplay/blob/master/lib/stsci/numdisplay/zscale.py
    // and converted to Javascript.  That GIT Archive has a BSD like licence with:
    //   Copyright (C) 2005 Association of Universities for Research in Astronomy (AURA)

    static MAX_REJECT = 0.5;
    static MIN_NPIXELS = 5;
    static GOOD_PIXEL = 0;
    static BAD_PIXEL = 1;
    static KREJ = 2.5;
    static MAX_ITERATIONS = 5;

    zscale( nsamples=1000, contrast=0.25 ) {
        // Implement IRAF zscale algorithm

        let samples = this.zsc_sample( nsamples );
        let npix = samples.length;
        samples.sort();
        let zmin = samples.at( 0 )
        let zmax = samples.at( samples.length - 1 );
        let center_pixel = Math.floor( ( npix - 1 ) / 2 );
        let median = samples.at( center_pixel );
        if ( npix % 2 == 0 )
            median = 0.5 * ( median + samples.at(center_pixel + 1) );
        let minpix = Math.max( ImView.MIN_NPIXELS, Math.floor( npix * ImView.MAX_REJECT ) );
        let ngrow = Math.max( 1, Math.floor( npix * 0.01 ) );
        let tmp = this.zsc_fit_line( samples, npix, ImView.KREJ, ngrow, ImView.MAX_ITERATIONS );
        let ngoodpix = tmp.ngoodpix;
        let zstart = tmp.zstart;
        let zslope = tmp.zslope;

        let z1 = zmin;
        let z2 = zmax;
        if ( ngoodpix >= minpix ) {
            if ( contrast > 0 ) zslope = zslope / contrast;
            z1 = Math.max( zmin, median - (center_pixel - 1) * zslope );
            z2 = Math.min( zmax, median + (npix - center_pixel) * zslope );
        }
        return [ z1, z2 ];
    }

    zsc_sample( maxpix ) {
        // Figure out which pixels to use for the zscale algorithm
        // Returns the 1-d array samples
        // Sample in a square grid, and return the first maxpix in the sample
        //
        // RKNOP 2026-07-21 : modified this a bit from the stsci python source.
        //   Want to build around the center rather than the lower left.
        //   This is probably overdone, but whatevs.
        let samples = [];
        let stride;
        if ( this.height > this.width ) stride = Math.round( this.width / Math.sqrt(maxpix) );
        else stride = Math.round( this.height / Math.sqrt(maxpix) );
        stride = Math.max( stride, 1 );
        let nx = Math.floor( this.width / stride );
        let ny = Math.floor( this.height / stride );
        if ( nx * ny < maxpix ) maxpix = nx * ny;
        let x0 = Math.floor( stride * nx / 2. );
        let y0 = Math.floor( stride * ny / 2. );
        let y = y0
        let dy = stride;
        while ( ( y >= 0 ) && ( y <= this.height ) ) {
            let off = y * this.width;
            let x = x0;
            let dx = stride;
            while ( ( x >= 0 ) && ( x <= this.width ) ) {
                let val = this.data.getFloat32( 4 * (off + x), true );
                if ( ! isNaN(val) ) samples.push( val );
                if ( samples.length >= maxpix )
                    break;
                if ( x <= x0 ) x += dx; else x -= dx;
                dx += stride;
            }
            if ( samples.length >= maxpix )
                break;
            if ( y <= y0 ) y += dy; else y -= dy;
            dy += stride;
        }
        if ( samples.length > maxpix ) {
            window.alert( "ERROR: This should never happen." )
            return;
        }

        return new Float32Array( samples );
    }

    zsc_fit_line( samples, npix, krej, ngrow, maxiter ) {
        let intercept, slope;

        // First re-map indices from -1.0 to 1.0
        let xscale = 2.0 / ( npix - 1 );
        let xnorm = new Float32Array( samples.length );
        for ( let i=0 ; i < samples.length ; i+=1 ) xnorm.set( [ i * xscale - 1.0 ], i );

        let minpix = Math.max( ImView.MIN_NPIXELS, Math.floor( npix * ImView.MAX_REJECT ) );
        let ngoodpix = npix;
        let last_ngoodpix = npix + 1;

        // This is the mask used in k-sigma clipping.  0 (ImView.GOOD_PIXEL) is good, 1 (ImView.BAD_PIXEL) is bad
        let badpix = new Int16Array( samples.length );
        badpix.fill( ImView.GOOD_PIXEL )

        for ( let n=0 ; n < maxiter ; n+=1 ) {
            if ( (ngoodpix >= last_ngoodpix) || (ngoodpix < minpix) )
                break;
            last_ngoodpix = ngoodpix;

            // Accumulate sums to calculate straight line fit
            let sumx = 0.;
            let sumxx = 0.;
            let sumxy = 0.;
            let sumy = 0.;
            let sum = 0.;
            for ( let i=0 ; i<xnorm.length ; i+=1 ) {
                if ( badpix.at(i) == ImView.GOOD_PIXEL ) {
                    sumx += xnorm.at(i);
                    sumxx += xnorm.at(i) ** 2;
                    sumxy += xnorm.at(i) * samples.at(i);
                    sumy += samples.at(i);
                    sum += 1;
                }
            }

            let delta = sum * sumxx - sumx * sumx;
            // Slope and intercept
            intercept = (sumxx * sumy - sumx * sumxy) / delta;
            slope = (sum * sumxy - sumx * sumy) / delta;

            // Subtract fitted line from the data array
            let flat = new Float32Array( xnorm.length );
            for ( let i=0 ; i < samples.length ; i+=1 )
                flat.set( [ samples.at(i) - ( xnorm.at(i) * slope + intercept ) ], i )

            // Compute the k-sigma rejection threshold
            let tmp = this.zsc_compute_sigma( flat, badpix, npix );
            let threshold = tmp.sigma * krej;

            // Detect and reject pixels further than k*sigma from the fitted line
            for ( let i=0 ; i<flat.length ; i+=1 )
                if ( ( flat.at(i) < -threshold ) || ( flat.at(i) > threshold ) )
                    badpix.set( [ ImView.BAD_PIXEL ], i );

            // Convolve with a kernel of length ngrow
            let newbadpix = new Int16Array( badpix.length );
            newbadpix.fill( ImView.GOOD_PIXEL );
            ngoodpix = 0;
            for ( let i = 0 ; i < badpix.length ; i += 1 ) {
                let j0 = Math.max( 0, i - ngrow );
                let j1 = Math.min( badpix.length, i + ngrow );
                let isbad = false;
                for ( let j = j0; j < j1 ; j += 1 ) {
                    if ( badpix.at(j) == ImView.BAD_PIXEL ) {
                        isbad = true;
                        break;
                    }
                }
                if ( isbad )
                    newbadpix.set( [ ImView.BAD_PIXEL ], i );
                else
                    ngoodpix += 1;
            }
            badpix = newbadpix;
        }

        return { 'ngoodpix': ngoodpix,
                 'zstart': intercept - slope,
                 'zslope': slope * xscale };
    }


    zsc_compute_sigma( flat, badpix, npix ) {
        let mean, sigma;

        // Compute the rms deviation from the mean of a flattened array.
        // Ignore rejected pixels

        let sumz = 0.;
        let sumsq = 0.;
        let n = 0;
        for ( let i=0 ; i<flat.length; i+=1 ) {
            if ( badpix.at(i) == ImView.GOOD_PIXEL ) {
                sumz += flat.at(i);
                sumsq += flat.at(i) ** 2;
                n += 1;
            }
        }

        if ( n == 0 ) {
            mean = null;
            sigma = null;
        }
        else if ( n == 1 ) {
            mean = sumz;
            sigma = null;
        }
        else {
            mean = sumz / n;
            sigma = sumsq / ( n - 1 ) - sumz * sumz / ( n * (n-1) );
            if ( sigma < 0. )
                sigma = 0.;
            else
                sigma = Math.sqrt( sigma );
        }

        return { 'ngoodpix': n,
                 'mean': mean,
                 'sigma': sigma };
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


    zscale_stretch() {
        this.min = this.zmin;
        this.max = this.zmax;
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
        // Make sure the svg has the defined box colors
        let svgstyle = document.createElementNS( ns, "style" );
        this.svg.appendChild( svgstyle );
        svgstyle.appendChild( document.createTextNode( ".zoombox-" + this.name +
                                                       " { fill: none; stroke: #008800; stroke-width: 2; }" ) );
        svgstyle.appendChild( document.createTextNode( ".red-" + this.name +
                                                       " { fill: none; stroke: #cc0000; stroke-width: 2; }" ) );
        svgstyle.appendChild( document.createTextNode( ".green-" + this.name +
                                                       " { fill: none; stroke: #00cc00; stroke-width: 2; }" ) );
        svgstyle.appendChild( document.createTextNode( ".blue-" + this.name +
                                                       " { fill: none; stroke: #2244cc; stroke-width: 2; }" ) );

        // Draw all squares
        for ( let square of this.squares ) {
            let rect = document.createElementNS( ns, "rect" );
            let dispx = ( square.x - this.x0 ) * this.scale;
            let dispy = this.dispheight - ( square.y - this.y0 ) * this.scale;
            let dispwid = square.width * this.scale;
            square.svgobj = document.createElementNS( ns, "rect" );
            square.svgobj.setAttribute( "x", dispx - dispwid / 2. );
            square.svgobj.setAttribute( "y", dispy - dispwid / 2. );
            square.svgobj.setAttribute( "width", dispwid );
            square.svgobj.setAttribute( "height", dispwid );
            square.svgobj.setAttribute( "class", square.color + "-" + this.name );
            this.svg.appendChild( square.svgobj );
        }
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
            this.zoombox.setAttribute( "class", "zoombox-" + this.name );
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
            let iimgx = Math.round( imgx );
            let iimgy = Math.round( imgy );
            if ( ( iimgx < 0 ) || ( iimgx >= this.width ) || ( iimgy < 0 ) || ( iimgy >= this.height ) ) {
                this.valwidget.value = "";
            }
            else {
                this.valwidget.value = rkWebUtil.floatToString(
                    this.data.getFloat32( 4 * ( iimgy * this.width + iimgx ), true ),
                    4 );
            }

            // If shift-click, or if middle-click, then recenter
            if ( ( ( evt.button == 0 ) && ( evt.shiftKey ) ) || ( evt.button == 1 ) ) {
                this.x0 = iimgx - this.dispwidth / 2. / this.scale;
                this.y0 = iimgy - this.dispheight / 2. / this.scale;
                this.render_image();
            }

            // External callback
            if ( this.clickcallback != null ) {
                this.clickcallback( imgx, imgy );
            }
        }
    }


    addsquare( x, y, width="10", color="blue", name=null ) {
        // Does NOT rerender.  Must call render_image manually after
        //   calling a bunch of addsquare

        if ( name == null ) {
            name = "imview-square-" + ImView.numSquares;
        }
        ImView.numSquares += 1;

        // TODO VALIDATE COLOR

        let square = { "name": name, "x": x, "y": y, "width": width, "color": color };
        let ns = "http://www.w3.org/2000/svg";
        let rect = document.createElementNS( ns, "rect" );
        let dispx = ( x - this.x0 ) * this.scale;
        let dispy = this.dispheight - ( y - this.y0 ) * this.scale;
        let dispwid = width * this.scale;
        square.svgobj = document.createElementNS( ns, "rect" );
        square.svgobj.setAttribute( "x", dispx - dispwid / 2. );
        square.svgobj.setAttribute( "y", dispy - dispwid / 2. );
        square.svgobj.setAttribute( "width", dispwid );
        square.svgobj.setAttribute( "height", dispwid );
        square.svgobj.setAttribute( "class", color + "-" + this.name );
        this.svg.appendChild( square.svgobj );
        this.squares.push( square );
    }
}

// **********************************************************************

export { ImView }
