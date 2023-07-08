import { exampleap } from "./ap.js";

exampleap.started = false;
exampleap.init_interval = window.setInterval(
    function()
    {
        var requestdata, renderer;
        if ( document.readyState == "complete" ) {
            if ( !exampleap.started ) {
                exampleap.started = true;
                window.clearInterval( exampleap.init_interval );
                renderer = new exampleap();
                renderer.init();
            }
        }
    },
    100 );
