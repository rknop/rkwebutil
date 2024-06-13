/**
 * This file is part of rkwebutil
 *
 * rkwebutil is Copyright 2023-2024 by Robert Knop
 *
 * rkwebutil is free software under the BSD 3-clause license (see LICENSE)
 */

import { tconv } from "./tconv.js";

tconv.started = false;
tconv.init_interval = window.setInterval(
    function()
    {
        var requestdata, renderer;
        if ( document.readyState == "complete" ) {
            if ( !tconv.started ) {
                tconv.started = true;
                window.clearInterval( tconv.init_interval );
                renderer = new tconv();
                renderer.init();
            }
        }
    },
    100 );
