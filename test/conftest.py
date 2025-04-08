# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023-2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

import time
import requests
import pytest

import psycopg
import psycopg.rows

@pytest.fixture(scope='module')
def database():
    conn = psycopg.connect( host='postgres', user='postgres', password='fragile', dbname='test_rkwebutil',
                            row_factory=psycopg.rows.dict_row )
    return conn

