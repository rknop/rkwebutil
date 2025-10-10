# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023-2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

import re
import time
import pytest

import selenium.webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.wait import WebDriverWait


class TestMJD:
    url = "https://flask:8080/"

    @pytest.fixture(scope='class')
    def browser( self ):
        opts = selenium.webdriver.FirefoxOptions()
        opts.add_argument( "--headless" )
        ff = selenium.webdriver.Firefox( options=opts )
        # Need this next one since the test env. uses a self-signed cert
        ff.accept_untrusted_certs = True
        ff.get( f'{self.url}/tconv' )

        datebutton = WebDriverWait( ff, timeout=10 ).until( lambda d: d.find_element(By.ID, 'convdate') )
        mjdbutton = ff.find_element(By.ID, 'convmjd' )
        dateinput = ff.find_element(By.ID, 'date' )
        mjdinput = ff.find_element(By.ID, 'mjd' )

        # This is ugly, but I need to wait to make sure that the
        #   javascript setup has had time to hook up the buttons.
        #   (Because the actual elements are created in the html
        #   template, they will exist before the javascript startup
        #   routine runs.)  I don't know of a way in selenium to wait
        #   for an element to have a callback, or check that an element
        #   has a callback attached.
        time.sleep(1)

        yield ( ff, mjdinput, dateinput, mjdbutton, datebutton )

        ff.close()
        ff.quit()

    def test_mjdtodate( self, browser ):
        _ff, mjdinput, dateinput, mjdbutton, _datebutton = browser

        mjd_date = { "60475"       : "^2024-06-14T00:00:00.000Z$",
                     "60474.99999" : "^2024-06-13T23:59:59.136Z$",
                     "60475.5"     : "^2024-06-14T12:00:00.000Z$",
                     "60675"       : "^2024-12-31T00:00:00.000Z$",
                     "60675.99999" : "^2024-12-31T23:59:59.136Z$",
                     "60676"       : "^2025-01-01T00:00:00.000Z$",
                     "60676.25"    : "^2025-01-01T06:00:00.000Z$",
                     "60676.75"    : "^2025-01-01T18:00:00.000Z$",
                     "60676.499999": "^2025-01-01T11:59:59.91[34]Z$",
                     "60676.500001": "^2025-01-01T12:00:00.086Z$" }

        for mjd, datestr in mjd_date.items():
            mjdinput.clear()
            mjdinput.send_keys( mjd )
            mjdbutton.click()
            assert re.search( datestr, dateinput.get_attribute( 'value' ) )

    def test_datetomjd( self, browser ):
        _ff, mjdinput, dateinput, _mjdbutton, datebutton = browser

        date_mjd = { "2024-06-14T00:00:00.000Z"   : 60475,
                     "2024-06-13T23:59:59.136Z"   : 60474.99999,
                     "2024-06-14T12:00:00.000Z"   : 60475.5,
                     "2024-12-31T00:00:00.000Z"   : 60675,
                     "2024-12-31T23:59:59.136Z"   : 60675.99999,
                     "2025-01-01T00:00:00.000Z"   : 60676,
                     "2025-01-01T06:00:00.000Z"   : 60676.25,
                     "2025-01-01T18:00:00.000Z"   : 60676.75,
                     "2025-01-01T11:59:59.913Z"   : 60676.499999,
                     "2025-01-01T12:00:00.086Z"   : 60676.500001
                    }

        for datestr, mjd in date_mjd.items():
            dateinput.clear()
            dateinput.send_keys( datestr )
            datebutton.click()
            assert float( mjdinput.get_attribute( 'value' ) ) == pytest.approx( mjd, abs=1e-6 )
