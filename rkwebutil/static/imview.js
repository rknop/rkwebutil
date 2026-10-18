// TODO : getter and setter for current group and current image that will update widgets and redraw and shit

import { rkWebUtil } from "./rkwebutil.js"

class ImViewGroup {
    constructor( imview, inparams={} )
    {
        let defaults = { "name": null,
                         "x0": null,
                         "y0": null,
                         "scale": null,
                         "min": null,
                         "max": null,
                         "info": {}
                       };
        rkWebUtil.paramParser( defaults, inparams, this );
        this.imview = imview;
        this.images = {};
        this.num_images = 0;
        if ( this.name === null ) {
            this.name = "imview-group-" + this.imview.num_groups.toString();
        }
        this.imview.num_groups += 1;
        this.zoom_source = null;
        this.scale_source = null;
        this._current_image = null;
    }

    get current_image() {
        if ( ( this._current_image == null ) || ( ! this.images.hasOwnProperty( this._current_image ) ) ) {
            let keys = Object.keys( this.images );
            if ( keys.length > 0 ) {
                this._current_image = keys[0];
            }
            else {
                this.current_image = null;
            }
        }
        return ( this.current_image === null ) ? null : this.images[ this._current_image ];
    }

    set current_image( name ) {
        if ( ! this.images.hasOwnProperty( name ) )
            throw new Error( "Group " + this.name + " doesn't have an image with name " + name );
        this._current_image = name;
    }

    add_image( params, make_current=false ) {
        let image = ImViewImage( params );
        if ( this.images.hasOwnProperty( image.name ) ) {
            throw new Error( "Error, group " + this.name + " already has an image with name " + image.name );
        }
        this.images[ image.name ] = image;
        if ( make_current ) this._current_image = image.name;
        return image.name;
    }

    remove_image( imagename, missing_ok=true ) {
        if ( this.images.hasOwnProperty( imagename ) ) {
            delete this.images[ imagename ];
        }
        else if ( ! missing_ok ) {
            throw new Error( "Error, group " + this.name + " doesn't have an image with name " + image.name );
        }
    }
}


class ImViewImage {
    constructor( imview, inparams={} )
    {
        let defaults = { "name": null,
                         "group": null,
                         "data": null,
                         "width": null,
                         "height": null,
                         "data_getter": null,
                         "start_with_group_zoom": true,
                         "start_with_group_stretch": false,
                         "zscale_samples": null,
                         "zscale_contrast": null,
                         "x0": null,
                         "y0": null,
                         "scale": null,
                         "min": null,
                         "max": null,
                         "replace": false,
                         "boxsets": [],
                         "info": {}
                       };
        let tmp = {};
        rkWebUtil.paramParser( defaults, imparams, tmp );

        if ( this.data !== null ) {
            if ( ( this.width === null ) || ( this.height === null ) )
                throw Error( "Must pass width and height with data" );
            this.init_data( data, width, height );
        }
        else if ( this.data_getter === null ) {
            throw Error( "Must either pass (image, width, height) or data_promise" );
        }

        this.imview = imview;

        if ( this.group == null ) this.group = this.imview.groups[ "_imview_root_group" ];
        else {
            if ( ! imview.groups.hasOwnProperty( this.group ) ) {
                throw new Error( "Error, tried to add an image to unknown group " + this.group );
            }
            this.group = this.imview.groups[ this.group ];
        }
        if ( this.name === null ) {
            this.name = "imview-image-" + this.group.name + this.group.num_images.toString();
        }
        this.group.num_images += 1;
    }

    async get_data( callback ) {
        if ( this.data != null ) callback( this.data, this.width, this.height );
        let result = await this.data_getter();
        this.init_data( result.data, result.width, result.height );
        callback( this.data, this.width, this.height );
    }
    
    init_data( data, width, height ) {
        if ( ( this.data == null ) || ( this.width == null ) || ( this.height == null ) ) {
            throw new Error( "ImViewImage: must have non-null data, width, and height." )
        }
        // I am boggled AGAIN by javascript not having an integer datatype but making all numbers doubles
        this.width = Math.floor( this.width );
        this.height = Math.floor( this.height );
        this.ndata = this.width * this.height;

        if ( ( this.group.images.hasOwnProperty( this.name ) ) && ( ! this.replace ) )
            throw new Error( "Error, group " + this.group.name + " already has an image with name " + this.name );

        if ( this.zscale_samples === null ) this.zscale_samples = this.imview.zscale_samples;
        if ( this.zscale_contrast === null ) this.zscale_contrast = this.imview.zscale_contrast;
        this.zscale_samples = Math.min( this.zscale_samples, this.ndata );
        let tmp = ImView.zscale( this.data, this.width, this.height, this.zscale_samples, this.zscale_contrast );
        this.zmin = tmp[0];
        this.zmax = tmp[1];

        this.init_min = this.min;
        this.init_max = this.max;
        if ( this.start_with_group_stretch ) {
            if ( this.init_min === null ) this.init_min = this.group.min;
            if ( this.init_max === null ) this.init_max = this.group.max;
        }
        if ( this.init_min === null ) this.init_min = this.zmin;
        if ( this.init_max === null ) this.init_max = this.zmax;
        this.min = this.init_min;
        this.max = this.init_max;

        this.init_x0 = this.x0;
        this.init_y0 = this.y0;
        this.init_scale = this.scale;
        if ( this.start_with_group_zoom ) {
            this.init_x0 = this.group.x0;
            this.init_y0 = this.group.y0;
            this.init_scale = this.group.scale;
        }
        this.x0 = this.init_x0;
        this.y0 = this.init_y0;
        this.scale = this.init_scale;
    }
}



class ImView {
    // data is stored in column-major format, like a FITS image.  It must be
    //   a DataView with little-endian float32 data.
    //   (Why little-endian?  Because that's native where I usually work.)
    // The assumption is that pixel (0,0) is the lower-left,
    //    which is backwards from html display

    // scale is in display pixels per data pixel

    // images are stored in groups; if a group isn't given, the default group is "_imview_root".

    // constructor two arguments; the first is a params, dictionary the second is a bool norender
    //
    // Allowed parameters and their defaults;
    // "data": null,
    // "width": null,
    // "height": null,
    // "dispwidth": 600,
    // "dispheight": 600,
    // "x0": null,
    // "y0": null,
    // "scale": null,
    // "parent": null,
    // "min": null,
    // "max": null,
    // "zscale_samples": 10000,
    // "zscale_contrast": 0.25,
    // "name": null,
    // "clickcallback": null

    // Global variables for tracking internal default names to avoid document id duplication

    static numImViews = 0;
    static numSquares = 0;

    // ****************************************
    // Constructor

    constructor( inparams={} ) {
        let self = this;
        let hbox, vbox, but;

        let defaults = { "parent_div": null,
                         "name": null,
                         "show_image_name": false,
                         "image_name_element": "h3",
                         "show_group_selector": false,
                         "show_image_selector": false,
                         "show_x_y_val": true,
                         "zoom_buttons": true,
                         "show_copy_zoom_button": false,
                         "copy_zoom_only_group": true,
                         "stretch_widgets": true,
                         "copy_stretch_button": false,
                         "copy_stretch_only_group": true,
                         "imview_div_id": "",
                         "imview_id": "",
                         "svg_id": "",
                         "zscale_samples": 10000,   // These are defaults that any image can override
                         "zscale_contrast": 0.25,
                         "group_change_callback": null,
                         "image_change_callback": null,
                         "clickcallback": null,
                         "css_classes": {
                             "imview": null,
                             "canvaswrapper": null,
                             "canvas": null,
                             "svg": null,
                             "zoominputwid": null,
                             "stretchinputwid": null,
                             "vbox": null,
                             "hbox": null,
                             "bold": null,
                             "justifyleft": null,
                             "justifycenter": null,
                             "marginleftex": null
                         },
                         "css_colors": {
                             "main": "black",
                             "background": "white",
                             "full": "black",
                             "mostlyfull": "#666666"
                         }
                       };
        rkWebUtil.paramParser( defaults, inparams, this, { 'recurse': true,
                                                           'recurse_params': {
                                                               'error_if_unknown': false,
                                                               'alert_if_known': false,
                                                               'assign_if_unknown': false,
                                                               'assign_only_known': true,
                                                               'recurse': false
                                                           } } );

        if ( this.name == null ) {
            this.name = "imview-" + ImView.numImViews.toString();
        }
        // If Javascript ever becomes not-single-threaded, we're screwed.  But I bet a lot of people are screwed.
        ImView.numImViews += 1;

        this.groups = {};
        this._current_group = null;
        this.add_group( { 'name': '_imview_root_group', make_current: true } );

        this.define_css_classes();
        this.div = rkWebUtil.elemaker( "div", this.parent_div, { "id": this.imview_div_id,
                                                                 "classes": [ this.css_classes.imview ] } );
        this.image_name_div = null;
        this.group_selector = null;
        this.image_selector = null;
        if ( this.show_image_selector || this.show_image_name ) {
            this.image_name_div = rkWebUtil.elemaker(
                "div", this.div, { "classes": [ this.css_classes.justifyleft, this.css_classes.hbox ] } );
            if ( this.show_image_selector ) {
                if ( this.show_group_selector ) {
                    rkWebUtil.elemaker( "span", this.image_name_div, { "text": "Group:",
                                                                       "classes": [ this.css_classes.bold ] } );
                    this.group_selector = rkWebUtil.elemaker(
                        "select", this.image_name_div, { "change": (e) => { self.select_group() } } );
                    rkWebUtil.elemaker( "option", this.group_selector,
                                        { "text": "<Root>", "attributes": { "value": "_imview_root_group",
                                                                            "selected": 1 } } );
                    rkWebUtil.elemaker( "span", this.image_name_div, { "text": "  " } );
                }
                rkWebUtil.elemaker( "span", this.image_name_div, { "text": "Image:",
                                                                   "classes": [ this.css_classes.bold ] });
                this.image_selector = rkWebUtil.elemaker(
                    "select", this.image_name_div, { "change": (e) => { self.select_image() } } );
                // Build the default image selector options
                this.select_group();
            }
            else {
                this.image_name_wid = rkWebUtil.elemaker( self.image_name_element, this.image_name_div,
                                                          { "text": "<no image>" } );
            }
        }

        this.infodiv = rkWebUtil.elemaker( "div", this.div,
                                           { "classes": [ this.css_classes.justifyleft,
                                                          this.css_classes.hbox ] } );
        if ( this.show_x_y_val ) {
            rkWebUtil.elemaker( "span", this.infodiv, { "text": "x:", "classes": [ this.css_classes.bold ] } );
            this.xwidget = rkWebUtil.elemaker( "input", this.infodiv, { "attributes": { 'size': 8,
                                                                                        'readonly': 1 } } );
            rkWebUtil.elemaker( "span", this.infodiv, { "text": "  y:", "classes": [ this.css_classes.bold ] } );
            this.ywidget = rkWebUtil.elemaker( "input", this.infodiv, { "attributes": { 'size': 8,
                                                                                        'readonly': 1 } } );
            rkWebUtil.elemaker( "span", this.infodiv, { "text": "  value:", "classes": [ this.css_classes.bold ] } );
            this.valwidget = rkWebUtil.elemaker( "input", this.infodiv, { "attributes": { 'size': 10,
                                                                                          'readonly': 1 } } );
        }

        this.canvasdiv = rkWebUtil.elemaker( "div", this.div, { "classes": [ this.css_classes.canvaswrapper ] } );
        this.canvas = null;
        this.svg = null;

        this.stretchdiv = rkWebUtil.elemaker( "div", this.div,
                                              { "classes": [ this.css_classes.justifycenter,
                                                             this.css_classes.hbox ] } );
        if ( this.stretch_widgets ) {
            this.minwidget = rkWebUtil.elemaker( "input", this.stretchdiv,
                                                 { "attributes": { "value": rkWebUtil.floatToString( this.min,
                                                                                                     { "nullok": true }
                                                                                                   ),
                                                                   "size": 10 },
                                                   "change": function() { self.set_stretch_and_render(); },
                                                   "classes": [ this.css_classes.stretchinputwid ] } );
            rkWebUtil.elemaker( "span", buttondiv, { "text": "  max:", "classes": [ 'bold' ] } );
            this.maxwidget = rkWebUtil.elemaker( "input", this.stretchdiv,
                                                 { "attributes": { "value": rkWebUtil.floatToString( this.max,
                                                                                                     { "nullok": true }
                                                                                                   ),
                                                                   "size": 10 },
                                                   "change": function() { self.set_stretch_and_render(); },
                                                   "classes": [ this.css_classes.stretchinputwid ] } );
            let but = rkWebUtil.button( this.stretchdiv, "Redraw", function() { self.set_stretch_and_render(); } );
            but.classList.add( this.css_classes.marginleftex );
            but = rkWebUtil.button( this.stretchdiv, "Reset Stretch", function() { self.reset_stretch(); } );
            but.classList.add( this.css_classes.marginleftex );
            but = rkWebUtil.button( this.stretchdiv, "ZScale", function() { self.zscale_stretch(); } );
            but.classList.add( this.css_classes.marginleftex );
            if ( this.copy_stretch_button ) {
                but = rkWebUtil.button( this.stretchdiv, "Copy Stretch", function() { self.copy_stretch(); } );
                but.classList.add( this.css_classes.marginleftex );
            }
        }

        this.zoomdiv = rkWebUtil.elemaker( "div", this.div,
                                           { "classes": [ this.css_classes.justifycenter,
                                                          this.css_classes.hbox ] } );
        if ( this.zoom_buttons ) {
            let but = rkWebUtil.button( this.zoomdiv, "Reset Zoom", function() { self.reset_zoom(); } );
            but = rkWebUtil.button( buttondiv, "Zoom Full", function() { self.zoom_full(); } );
            but.classList.add( this.css_classes.marginleftex );
            but = rkWebUtil.button( this.zoomdiv, "Zoom In", function() { self.zoom_in(); } );
            but.classList.add( this.css_classes.marginleftex );
            but = rkWebUtil.button( this.zoomdiv, "Zoom Out", function() { self.zoom_out(); } );
            but.classList.add( this.css_classes.marginleftex );
            if ( this.show_copy_zoom_button ) {
                but = rkWebUtil.button( this.zoomdiv, "Copy Zoom", function() { self.copy_zoom(); } );
                but.classList.add( this.css_classes.marginleftex );
            }
        }

        this.dispwidth = null;
        this.dispheight = null;
        this.last_dispwidth = null;
        this.last_dispheight = null;
        this.resize_observer = new ResizeObserver( (wids) => { self.resized( wids ); } );
        this.resize_observer.observe( this.canvasdiv );
        // Make sure it's always called at least once so dispwidth and dispheight get initialized.
        // This isn't necessary if this.parent_div is null, because the resize event *should*
        //   be triggered when this.div is appendChilded to something.  However, if this.parentdiv
        //   is not null, we appendChilded above before we had created this resize observer.
        if ( this.parent_div !== null )
            window.dispatchEvent( new Event( 'resize' ) );
    }

    get current_group()
    {
        return this._current_group;
    }

    set current_group( name )
    {
        if ( ! this.groups.hasOwnProperty( name ) )
            throw new Error( "Unknown group " + name );

        if ( this._current_group != this.groups[ name ] ) {
            this._current_group = this.groups[ name ];
            this.render_image();
            if ( this.group_change_callback !== null )
                this.group_change_callback( name );
        }
    }

    get current_image()
    {
        if ( this._current_group === null ) return null;
        return this.current_group.current_image;
    }

    // This next one is scary, because images won't have unique names
    //   globally, only within groups.  So, it takes
    //   {group_name}:{image_name}, which won't work if {group_name} has
    //   any colons in it.
    set current_image( name_mess )
    {
        const name_regex = /^([^:]+):(.*)$/;
        let match = name_mess.match( name_regex );
        if ( match === null )
            throw new Error( "Failed to parse group:image from \"" + name_mess + "\"" );
        this.set_current_image( match[1], match[2] );
    }

    set_current_image( group, image ) {
        if ( ! this.groups.hasOwnProperty( group ) )
            throw new Error( "Unknown group " + group );

        if ( ( this._current_group != group ) || ( this._current_group.current_image != image ) ) {
            this.groups[ group ].current_image = image;
            this.current_group = this.groups[ group ];
            this.iamge_change_callback( image, group );
        }
    }

    add_group( params={}, make_current=false, exist_ok=true )
    {
        let group = null;
        if ( params.hasOwnProperty( "name" ) && this.groups.hasOwnProperty( params['name'] ) ) {
            if ( ! exist_ok ) {
                throw Error( "Group " + params['name'] + " already exists." );
            }
            group = this.groups[ params['name'] ];
        } else {
            group = new ImViewGroup( this, params )
            this.groups[ group.name ] = group;
        }
        if ( make_current ) {
            if ( ( this._current_group === null ) || ( this._current_group.name != group.name ) ) {
                this.current_group = this.groups[ group.name ];
            }
        }
    }

    add_image( params, make_current=false, group=null, dont_make_current_if_no_current=false )
    {
        if ( group === null ) group = '_imview_root_group';
        let newimagename = this.groups[ group ].add_image( params );
        if ( ( ( this._current_group === null ) || ( this._current_group.current_image === null ) )
             && ( ! dont_make_current_if_no_current ) ) make_current=true;
        if ( make_current ) {
            this.[groups][group].current_image = newimagename;
            this.current_group = this.groups[ group ];
            this.render_image();
        }
    }

    select_group() {
        let group = this.group_selector.value;
        this.set_current_group( group );
    }

    select_image() {
        let group = null;
        if ( this.show_group_selector )
            group = this.group_selector.value;
        else
            group = this.current_group;
        let image = this.image_selector.value;
        this.set_current_image( group, image );
    }


    static _default_css_classes_defined = false;

    define_css_classes() {
        let head = document.getElemntsByTagName( 'head' )[0];

        let defaultstyle = (cls, styles, elemtype="") => {
            if ( this.css_classes[cls] === null ) {
                if ( ! ImView._default_css_classes_defined ) {
                    let elem = document.createElement( "style" );
                    elem.type = "text/css";
                    let text = elemtype + "." + "_imview_" + cls + " {\n";
                    for ( let prop in styles ) {
                        text += "  " + prop + ":" + styles[prop] + ";\n";
                    }
                    text += "}";
                    elem.innerHTML = text;
                    head.appendChild( elem );
                }
                this.css_classes[style] = "_imview_" + cls;
            }
        }

        defaultstyle( "imview", { "display": "flex",
                                  "flex-direction": "column",
                                  "justify-content": "flex-start",
                                  "flex-grow": 1,
                                  "flex-shrink": 1,
                                  "min-width": 0,
                                  "min-height": 0,
                                  "padding": "1ex",
                                  "border": "1px solid " + this.css_colors.full
                                }, "div" );
        defaultstyle( "canvaswrapper", { "position": "relative",
                                         "margin": 0,
                                         "padding": 0,
                                         "border": 0 }, div );
        defaultstyle( "canvas", { "position": "absolute",
                                  "left": 0,
                                  "top": 0,
                                  "margin": 0,
                                  "padding": 0,
                                  "border": 0,
                                  "z-index": 1,
                                  "image-rendering": "pixelated"
                                }, "canvas" )
        defaultstyle( "svg", { "position": "absolute",
                               "left": 0,
                               "top": 0,
                               "margin": 0,
                               "padding": 0,
                               "border": 0,
                               "z-index":2,
                               "pointer-events": "none"
                             }, "svg" );
        defaulttyle( "vbox", { "display": "flex",
                               "flex-direction": "column",
                               "min-width": 0,
                               "min-height": 0
                             }, "div" );
        defaultstyle( "hbox", { "display": "flex",
                                "flex-directon": "row",
                                "min-width": 0,
                                "min-height": 0
                              }, "div" );
        defaultstyle( "bold", { "font-weight": "bold" } );
        defaultstyle( "justifyleft",  { "justify-content": "flex-start" } );
        defaultstyle( "justifycenter", { "justify-content": "center" } );
        defaultstyle( "zoominputwid", { "border-style": "outset", "border-color": this.css_colors.mostlyfull } );
        defaultstyle( "stretchinputwid", { "border-style": "outset", "border-color": this.css_colors.mostlyfull } );
        defaultstyle( "marginleftex", { "margin-left": "1ex" } );

        ImView._default_css_classes_defined = true;
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

    resized( wids ) {
        if ( wids.length != 1 ) {
            window.alert( "I am surprised." );
            throw new Error( "I don't understand ResizeObserver." );
        }
        let wid = wids[0];
        this.dispwidth = wid.contentBoxSize[0].inlineSize;
        this.dispheight = wid.contentBoxSize[0].blockSize;
        if ( ( this.dispwidth != this.last_dispwidth ) || ( this.dispheight != this.last_dispheight) ) {
            this.render_image();
        }
    }

    render_image()
    {
        let self = this;

        if ( ( this.dispwidth === null ) || ( this.dispheight === null ) ) {
            // I don't know how to do my stuff, so don't do it.
            return;
        }
        if ( ( this._current_group == null ) || ( this._current_group._current_image == null ) ) {
            // TODO render a default image
            return;
        }

        let image = this._current_group.current_image;
        image.get_data().then( {data,width,height} => { self.actually_render_image() } );
    }

    actually_render_image()
    {
        if ( ( this.dispwidth === null ) || ( this.dispheight === null ) ) {
            // I don't know how to do my stuff, so don't do it.
            return;
        }
        if ( ( this._current_group == null ) || ( this._current_group._current_image == null ) ) {
            // TODO render a default image
            return;
        }
        
        if ( image.data === null ) {
            // TODO : option to render something default, or
            //   an error message on to the canvas.
            throw Error( "image.data not available" )
        }

        let svgns = "http://www.w3.org/2000/svg";

        // This if block will always trigger at least once because we set this.last_disp* = null in
        //   the constructor, and the if above ensures this.disp* is not null
        if ( ( this.dispwidth != this.last_dispwidth ) || ( this.dispheight != this.last_dispheight ) ) {
            rkWebUtil.wipeDiv( this.canvasdiv );
            if ( ( image.x0 === null ) || ( this.last_dispwidth === null ) ) {
                image.scale = ( ( ( this.dispheight / image.height ) < ( this.dispwidth / image.width ) )
                                ? this.dispheight / image.height : this.dispwidth / image.width );
                image.x0 = ( image.width / 2. ) - ( this.dispwidth / 2. / image.scale );
                image.y0 = ( image.height / 2. ) - ( this.dispheight / 2. / image.scale );
            }
            else {
                // Set the new scale so that the same amount of stuff will be displayed on whichever
                //    axis is smaller
                let cx = image.x0 + ( this.last_dispwidth / 2. / image.scale );
                let cy = image.y0 + ( this.last_dispheight / 2. / image.scale );
                let oldlx = Math.max( image.x0, 0. );
                let oldhx = Math.min( image.x0 + ( this.last_dispwidth / image.scale ), image.width );
                let oldly = Math.max( image.y0, 0. );
                let oldhy = Math.min( image.y0 + ( this.last_dispheight / image.scale ), image.height );
                if ( ( this.dispwidth / ( oldhx - oldlx ) ) < ( this.dispheight / ( oldhy - oldly ) ) ) {
                    image.scale = this.dispwidth / ( oldhx - oldlx );
                } else {
                    image.scale = this.dispheight / ( oldhy - oldly );
                }
                image.x0 = cx - ( this.dispwidth / 2. / image.scale );
                image.y0 = cy - ( this.dispheight / 2. / image.scale );
                // TODO : we need to modify the image.init_* here properly!
                // (Then also move the setting of those below this else to the right place.)
            }
            if ( image.init_scale === null ) image.init_scale = image.scale;
            if ( image.init_x0 === null ) image.init_x0 = image.x0;
            if ( image.init_y0 === null ) image.init_y0 = image.y0;
            this.last_dispwidth = this.dispwidth;
            this.last_dispheight = this.dispheight;

            this.canvas = rkWebUtil.elemaker( "canvas", this.canvas_div,
                                              { "attributes": { "width": this.dispwidth,
                                                                "height": this.dispheight },
                                                "classes": [ this.css_classes.canvas ] } );
            this.canvas.style.width = this.dispwidth.toString() + "px";
            this.canvas.style.height = this.dispheight.toString() + "px";
            this.canvas.addEventListener( "mousedown", (e) => { self.mousedown(e) } );
            this.canvas.addEventListener( "mouseup", (e) => { self.mouseup(e) } );

            this.svg = document.createElementNS( svgns, "svg" );
            this.svg.setAttributeNS( 'http://www.w3.org/2000/xmlns/', "xmlns", svgns );
            this.svg.classList.add( this.css_classes.svg );
            this.svg.style.width = this.dispwidth.toString() + "px";
            this.svg.style.height = this.dispheight.toString() + "px";
            this.svg.setAttribute( "width", this.dispwidth );
            this.svg.setAttribute( "hieght", this.dispheight );
            this.svg.setAttribute( "id", this.svg_id );
            this.canvas_div.appendChild( this.svg );
        }
        if ( ( image.x0 === null ) || ( this.canvas === null ) || ( this.svg === null ) )
            throw new Error( "This should never happen." );

        // Don't (yet?) support backwards color mapping
        if ( image.max < image.min ) {
            let tmp = image.min;
            image.min = image.max;
            image.max = tmp;
            if ( this.stretch_widgets ) {
                this.minwiget.value = min;
                this.maxwidget.value = max;
            }
        }

        let ctx = this.canvas.getCotnext( "2d", { 'alpha': false } );
        let imagedata = ctx.createImageData( this.dispwidth, this.dispheight );

        // Does javascript have vectorized stuff to make this faster?
        // Note : remember that astronomical images have (0, 0) at the lower-left,
        //   but browsers think (0, 0) is the upper-left.
        for( let dispy = 0 ; dispy < this.dispheight ; ++dispy ) {
            let off = dispy * this.dispwidth * 4;
            let imgy = Math.round( ( this.dispheight - dispy ) / image.scale + image.y0 );
            let yoffedge = ( imgy < 0 ) || ( imgy >= img.height );
            let lastimgx = -1e32;
            let bval = 0;
            for ( let dispx = 0 ; dispx < this.dispwidth ; ++dispx ) {
                let imgx = 0;
                let offedge = yoffedge;
                if ( ! offedge ) {
                    imgx = Math.round( dispx / image.scale + image.x0 );
                    offedge = ( imgx < 0 ) || ( imgx >= image.width );
                }
                if ( offedge ) {
                    bval = 255;
                }
                else {
                    if ( imgx != lastimgx ) {
                        let val = image.data[ imgy * image.width + imgx ];
                        bval = ImView.float_to_byte( val, image.min, image.max, 0 );
                    }
                }
                imagedata.data[ off     ] = bval;
                imagedata.data[ off + 1 ] = bval;
                imagedata.data[ off + 2 ] = bval;
                imagedata.data[ off + 3 ] = 255;
                lastimgx = imgx;
                off += 4;
            }
        }

        this.ctx.putImageData( imagedata, 0, 0 );

        // Make the overlay drawing svg, used both for square drawing and zooming

        rkWebUtil.wipeDiv( this.svg );

        let svgstyle = document.createElementNS( svgns, "style" );
        this.svg.appendChild( svgstyle );
        svgstyle.appendChild( document.createTextNode( ".zoombox-" + this.name +
                                                       " { fill: none; stroke: #008800; stroke-width: 2; }" ) );
        // Draw all squares
        for ( let i in image.boxsets ) {
            let boxes = image.boxsets[ i ];
            let style = "svgbox-" + this.name + "-" + i.toString();
            svgstyle.appendChild( document.createTextNode( "." + style +
                                                           " { fill: none; stroke: " + boxes.color + "; " +
                                                           "stroke-width: 2; }" ) );
            for ( let square of boxes.boxes ) {
                let rect = document.createElementNS( ns, "rect" );
                let dispx = ( square.x - image.x0 ) * image.scale;
                let dispy = image.dispheight - ( square.y - image.y0 ) * image.scale;
                let dispwid = square.width * image.scale;
                square.svgobj = document.createElementNS( ns, "rect" );
                square.svgobj.setAttribute( "x", dispx - dispwid / 2. );
                square.svgobj.setAttribute( "y", dispy - dispwid / 2. );
                square.svgobj.setAttribute( "width", dispwid );
                square.svgobj.setAttribute( "height", dispwid );
                square.svgobj.setAttribute( "class", color );
                this.svg.appendChild( square.svgobj );
            }
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
        if ( ( this._current_group == null ) || ( this._current_group.current_image == null ) ) {
            // TOOD THINK : when would this happen?
            return;
        }

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

        if ( ( this._current_group == null ) || ( this._current_group.current_image == null ) ) {
            // TOOD THINK : when would this happen?
            return;
        }
        let image = this._current_group.current_image;

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
            let imgx0 = this.initmousex / image.scale + image.x0;
            let imgy0 = ( this.dispheight - this.initmousey ) / image.scale + image.y0;
            let imgx1 = dispx / image.scale + image.x0;
            let imgy1 = ( this.dispheight - dispy ) / image.scale + image.y0;
            let ctrx = ( imgx0 + imgx1 ) / 2.;
            let ctry = ( imgy0 + imgy1 ) / 2.;
            let width = Math.abs( imgx1 - imgx0 );
            let height = Math.abs( imgy1 - imgy0 );
            let oldheight = this.dispheight / image.scale;
            let oldwidth = this.dispwidth / image.scale;
            if ( ( oldheight / height ) < ( oldwidth / width ) ) {
                image.scale = this.dispheight / height;
            } else {
                image.scale = this.dispwidth / width;
            }
            image.x0 = ctrx - this.dispwidth / 2. / image.scale;
            image.y0 = ctry - this.dispheight / 2. / image.scale;
            this.render_image();
        }
        else {
            let imgx = dispx / image.scale + image.x0;
            let imgy = ( this.dispheight - dispy ) / image.scale + image.y0;
            let iimgx = Math.round( imgx );
            let iimgy = Math.round( imgy );
            if ( this.show_x_y_val ){
                this.xwidget.value = imgx.toFixed( 2 );
                this.ywidget.value = imgy.toFixed( 2 );
                if ( ( iimgx < 0 ) || ( iimgx >= image.width ) || ( iimgy < 0 ) || ( iimgy >= image.height ) ) {
                    this.valwidget.value = "";
                }
                else {
                    this.valwidget.value = rkWebUtil.floatToString( image.data[ iimgy * image.width + iimgx ],
                                                                    { "nullok": true } );
                }
            }

            // If shift-click, or if middle-click, then recenter
            if ( ( ( evt.button == 0 ) && ( evt.shiftKey ) ) || ( evt.button == 1 ) ) {
                this.x0 = iimgx - this.dispwidth / 2. / image.scale;
                this.y0 = iimgy - this.dispheight / 2. / image.scale;
                this.render_image();
            }

            // External callback
            if ( this.clickcallback != null ) {
                this.clickcallback( imgx, imgy );
            }
        }
    }


    // addsquare( x, y, width="10", color="blue", name=null ) {
    //     // Does NOT rerender.  Must call render_image manually after
    //     //   calling a bunch of addsquare

    //     if ( name == null ) {
    //         name = "imview-square-" + ImView.numSquares;
    //     }
    //     ImView.numSquares += 1;

    //     // TODO VALIDATE COLOR

    //     let square = { "name": name, "x": x, "y": y, "width": width, "color": color };
    //     let ns = "http://www.w3.org/2000/svg";
    //     let rect = document.createElementNS( ns, "rect" );
    //     let dispx = ( x - this.x0 ) * this.scale;
    //     let dispy = this.dispheight - ( y - this.y0 ) * this.scale;
    //     let dispwid = width * this.scale;
    //     square.svgobj = document.createElementNS( ns, "rect" );
    //     square.svgobj.setAttribute( "x", dispx - dispwid / 2. );
    //     square.svgobj.setAttribute( "y", dispy - dispwid / 2. );
    //     square.svgobj.setAttribute( "width", dispwid );
    //     square.svgobj.setAttribute( "height", dispwid );
    //     square.svgobj.setAttribute( "class", color + "-" + this.name );
    //     this.svg.appendChild( square.svgobj );
    //     this.squares.push( square );
    // }

    // **********************************************************************
    // Static methods

    // Static methods for dealing with float/byte data and for zscaling

    static float_to_byte( f, min, max, nanvalue=0 )
    {
        if ( isNaN(f) ) return nanvalue;
        else if ( f <= min ) return 0;
        else if ( f >= max ) return 255;
        else return Math.round( ( f - min ) * 255 / ( max - min ) );
    }

    static is_little_endian() {
        let buffer = new ArrayBuffer(2);
        let dv = new DataView( buffer );
        dv.setInt16( 0, 256, true );
        let iarr = new Int16Array( buffer );
        return iarr[0] === 256;
    }

    // zscale functions were stolen from
    //   https://github.com/spacetelescope/stsci.numdisplay/blob/master/lib/stsci/numdisplay/zscale.py
    // and converted to Javascript.  That git archive has a BSD-like licence with:
    //   Copyright (C) 2005 Association of Universities for Research in Astronomy (AURA)

    static MAX_REJECT = 0.5;
    static MIN_NPIXELS = 5;
    static GOOD_PIXEL = 0;
    static BAD_PIXEL = 1;
    static KREJ = 2.5;
    static MAX_ITERATIONS = 5;

    static zscale( data, width, height, nsamples=1000, contrast=0.25 ) {
        // Implement IRAF zscale algorithm

        let samples = ImView.zsc_sample( nsamples, data, width, height );
        return ImView.zsc_limits( samples, contrast, true );
    }

    static zsc_sample( maxpix, data, width, height ) {
        // Figure out which pixels to use for the zscale algorithm
        // Returns the 1-d array samples
        // Sample in a square grid, and return the first maxpix in the sample
        //
        // RKNOP 2026-07-21 : modified this a bit from the stsci python source.
        //   Want to build around the center rather than the lower left.
        //   This is probably overdone, but whatevs.
        let samples = [];
        let stride;
        if ( height > width ) stride = Math.round( width / Math.sqrt(maxpix) );
        else stride = Math.round( height / Math.sqrt(maxpix) );
        stride = Math.max( stride, 1 );
        let nx = Math.floor( width / stride );
        let ny = Math.floor( height / stride );
        if ( nx * ny < maxpix ) maxpix = nx * ny;
        let x0 = Math.floor( stride * nx / 2. );
        let y0 = Math.floor( stride * ny / 2. );
        let y = y0
        let dy = stride;
        while ( ( y >= 0 ) && ( y <= height ) ) {
            let off = y * width;
            let x = x0;
            let dx = stride;
            while ( ( x >= 0 ) && ( x <= width ) ) {
                let val = data[ off + x ];
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

    static zsc_limits( samples, contrast, nukesamples=false ) {
        if ( ! nukesamples ) {
            let newsamples;
            if ( samples instanceof Float32Array ) {
                newsamples = new Float32Array( samples.length );
            }
            else if ( samples instanceof Float64Array ) {
                newsamples = new Float64Array( samples.length );
            }
            else {
                window.alert( "imview zscale failed, doesn't know how to handle the samples you gave me" );
                throw new Error( "invalid type for samples" );
            }
            newsamples.set( samples );
            samples = newsamples;
        }
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
        let tmp = ImView.zsc_fit_line( samples, npix, ImView.KREJ, ngrow, ImView.MAX_ITERATIONS );
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

    static zsc_fit_line( samples, npix, krej, ngrow, maxiter ) {
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
            let tmp = ImView.zsc_compute_sigma( flat, badpix, npix );
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

    static zsc_compute_sigma( flat, badpix, npix ) {
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

}

// **********************************************************************

export { ImView, ImViewImage, ImViewGroup }
