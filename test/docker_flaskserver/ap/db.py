from datetime import datetime, timedelta
from contextlib import contextmanager
import dateutil.parser
import pytz
import uuid
import sqlalchemy
import sqlalchemy.orm.session
import sqlalchemy.ext.declarative
import sqlalchemy.pool
from sqlalchemy.dialects.postgresql import UUID as sqlUUID
from sqlalchemy.dialects.postgresql import JSONB

Base = sqlalchemy.ext.declarative.declarative_base()

_user = None
_password = None
_host = None
_port = None
_database = None
_engine = None
_sessionfac = None

# ======================================================================
# Database initialization

def setdbparams( user, password, host, port, database ):
    global _user, _password, _host, _port, _database
    _user = user
    _password = password
    _host = host
    _port = port
    _database = database

# ======================================================================
# Getting a session, recycling the passed one if not None, otherwise
#   automatically closing the one created when done.

@contextmanager
def DBSession( cur=None ):
    global _engine, _sessionfac, _user, _password, _host, _port, _database
    
    if cur is not None:
        if not isinstance( cur, sqlalchemy.orm.session.Session ):
            raise TypeError( "Must pass a SQLAlchemy session, or None, to DBSession" )
        yield cur
        return

    if _engine is None:
        if any( [ _user is None, _password is None, _host is None, _port is None, _database is None ] ):
            raise RuntimeError( "Must initialize database with setdbparams before calling DBSession)" )
        _engine = sqlalchemy.create_engine( f'postgresql://{_user}:{_password}@{_host}:{_port}/{_database}',
                                            poolclass=sqlalchemy.pool.NullPool )
        _sessionfac = sqlalchemy.orm.sessionmaker( bind=_engine, expire_on_commit=False )

    session = _sessionfac()
    yield session
    session.close()

# ======================================================================-
# Utility functions

_NULLUUID = uuid.UUID( '00000000-0000-0000-0000-000000000000' )

def asUUID( val, canbenone=True ):
    """Convert a string to uuid.UUID.

    Will throw a ValueError if val isn't properly formatted.

    Parameters
    -----------
      val : str or uuid.UUID
        The UUID to convert.  If val is a uuid.UUID, then it just returns val.

      canbenone : bool, default True
        If True, returns None when val is None.  If False, when val is None,
        returns uuid.UUID('00000000-0000-0000-0000-000000000000').

    Returns
    -------
      uuid.UUID or None
    
    """

    if val is None:
        if canbenone:
            return None
        else:
            return _NULLUUID
    if isinstance( val, uuid.UUID ):
        return val
    else:
        return uuid.UUID( val )


def asDateTime( string ):
    """Convert a string to a datetime.datetime

    Doesn't do anything to take care of timezone aware vs. timezone
    unaware dates.  It probably should.  Dealing with that is always a
    nightmare.

    Parameters
    ----------
      string: str or datetime.datetime
        If a datetime.datetime, just rturns the argument.  Otherwise,
        string must be something that dateutil.parser.pasre can handle.

    Returns
    -------
      datetime.datetime

    """

    if string is None:
        return None
    if isinstance( string, datetime ):
        return string
    if not isinstance( string, str ):
        raise RuntimeError( f'Error, must pass either a datetime or a string to asDateTime, not a {type(string)}' )
    string = string.strip()
    if len(string) == 0:
        return None
    try:
        dateval = dateutil.parser.parse( string )
        return dateval
    except Exception as e:
        if hasattr( e, 'message' ):
            sys.stderr.write( f'Exception in asDateTime: {e.message}\n' )
        else:
            sys.stderr.write( f'Exception in asDateTime: {e}\n' )
        raise RuntimeError( f'Error, {string} is not a valid date and time.' )

    
# ======================================================================

class AuthUser(Base):
    __tablename__ = "authuser"

    id = sqlalchemy.Column( sqlUUID(as_uuid=True), primary_key=True, default=uuid.uuid4 )
    username = sqlalchemy.Column( sqlalchemy.Text, nullable=False, unique=True, index=True )
    displayname = sqlalchemy.Column( sqlalchemy.Text, nullable=False )
    email = sqlalchemy.Column( sqlalchemy.Text, nullable=False, index=True )
    pubkey = sqlalchemy.Column( sqlalchemy.Text )
    privkey = sqlalchemy.Column( JSONB )
    
    @classmethod
    def get( cls, id, session=None ):
        id = id if isinstance( id, uuid.UUID) else uuid.UUID( id )
        with DBSession( session ) as sess:
            q = sess.query(cls).filter( cls.id==id )
            if q.count() > 1:
                raise ErrorMsg( f'Error, {cls.__name__} {id} multiply defined!  This shouldn\'t happen.' )
            if q.count() == 0:
                return None
            return q[0]

    @classmethod
    def getbyusername( cls, name, session=None ):
        with DBSession( session ) as sess:
            q = sess.query(cls).filter( cls.username==name )
            return q.all()

    @classmethod
    def getbyemail( cls, email, session=None ):
        with DBSession( session ) as sess:
            q = sess.query(cls).filter( cls.email==email )
            return q.all()

# ======================================================================

class PasswordLink(Base):
    __tablename__ = "passwordlink"

    id = sqlalchemy.Column( sqlUUID(as_uuid=True), primary_key=True, default=uuid.uuid4 )
    userid = sqlalchemy.Column( sqlUUID(as_uuid=True),
                                sqlalchemy.ForeignKey("authuser.id", ondelete="CASCADE"),
                                index=True )
    expires = sqlalchemy.Column( sqlalchemy.DateTime(timezone=True) )
    
    @classmethod
    def new( cls, userid, expires=None, session=None ):
        if expires is None:
            expires = datetime.now(pytz.utc) + timedelta(hours=1)
        else:
            expires = asDateTime( expires )
        with DBSession( session ) as sess:
            link = PasswordLink( userid = asUUID(userid),
                                 expires = expires )
            sess.add( link )
            sess.commit()
            return link

    @classmethod
    def get( cls, uuid, session=None ):
        with DBSession( session ) as sess:
            q = sess.query( PasswordLink ).filter( PasswordLink.id==uuid )
            if q.count() == 0:
                return None
            else:
                return q.first()
