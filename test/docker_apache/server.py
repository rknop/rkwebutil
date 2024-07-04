#!/usr/bin/python
import sys
import os
sys.path.insert( 0, os.path.dirname( os.path.realpath( __file__ ) ) )

from ap import create_app

application = create_app()
