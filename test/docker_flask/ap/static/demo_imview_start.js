/**
 * This file is part of rkwebutil
 *
 * rkwebutil is Copyright 2023-2024 by Robert Knop
 *
 * rkwebutil is free software under the BSD 3-clause license (see LICENSE)
 */

import { demo_imview } from "./demo_imview.js";

demo_imview.started = false;
demo_imview.init_interval = window.setInterval(
    function()
    {
        var requestdata, renderer;
        if ( document.readyState == "complete" ) {
            if ( !demo_imview.started ) {
                demo_imview.started = true;
                window.clearInterval( demo_imview.init_interval );
                renderer = new demo_imview();
                renderer.init();
            }
        }
    },
    100 );
