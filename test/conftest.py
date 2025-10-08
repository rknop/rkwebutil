# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023-2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

import pytest

import psycopg2
import psycopg2.extras


@pytest.fixture(scope='module')
def database():
    conn = psycopg2.connect( host='postgres', user='postgres', password='fragile', dbname='test_rkwebutil',
                             cursor_factory=psycopg2.extras.RealDictCursor )
    return conn
