#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023 by Robert Knop
#
# rkwebutil is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the
# Free Software Foundation, either version 3 of the License, or (at your
# option) any later version.
#
# rkwebutil is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
# FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
# for more details.
#
# You should have received a copy of the GNU General Public License
# along with rkwebutil. If not, see <https://www.gnu.org/licenses/>.

import sys
import os
import logging
import pathlib
import types
import copy
import yaml
import traceback

class Config:
    """Interface for yaml config file.

    Read a yaml file that might include other yaml files, and provide an
    interface. The top level of the yaml must be a dict. Only supports
    dicts, lists, and scalars.

    CAVEATS:
    Won't work with any old yaml file.  Top level must be a dictionary.
    Don't name your dictionary fields as numbers, as the code will then
    detect it as a list rather than a dict.

    The yaml parser seems to be parsing "yyyy-mm-dd" strings as a
    datetime.date; beware.

    Three top-level fields have special handling.

      preloads -- these config files will be loaded *before* processing
                  the current file.

      augments -- These config files will be read *after* processing the
                  current file, extending lists but overriding other
                  things (see below).

      overrides -- These config files will be read *after* processing
                   the current file and any augments, overriding
                   anything already set.

    Conflicts: when reading a new file (i.e. a later preload, the
    current file when there is already data from preloads, or an
    override or augment), conflicts (i.e. the same name-path appears in
    both the current data and the new file) are handled by the "augment"
    and "override" methods (see below).  Subsequent preloads, and the
    current file following the preloads, are handled with "override".

    Lots of copying is done on these merges, but hopefully we're not talking
    huge amounts of data in config trees, so that's not a big deal.

    Configs are *global* for the current running python session.  (The
    config object for a given filename is a singleton.)

    To use:

    1. Optional: call Config.init(filename)

    2. Instantiate a config object with

           confobj = Config.get()
       or

           confobj = Config.get(filename)

       in the former case, it will get the default file.  (That's the
       file that was passed to Config.init, or specified to the first
       .get call.)  You can't do the first one if you haven't done the
       second one yet, or if you haven't called Config.init yet.  Do NOT
       call __init__ (i.e. don't say confobj = Config() or
       Config(filename)).

    3. Get a config value with

           configval = confobj.value( fieldspec )

       where fieldspec is just the field for a scalar, or .-separated
       fields for lists and dicts.  For lists, it must be a (0-offset)
       integer index.  For example, if the yaml has:

          database:
             engine: postgresql

       then confobj.value("database.engine") will return "postgresql".

    4. Change a config value with

           confobj.set_or_append_value( fieldspec, value )

       This only changes it for the running session, it does *not*
       affect the YAML files in storage.

    """

    _default_default = None

    _default = None
    _configs = {}

    @staticmethod
    def init( configfile=None, logger=logging.getLogger("main"), dirmap={} ):
        """Initialize configuration globally for process."""

        Config.get( configfile, logger=logger, dirmap=dirmap )

    @staticmethod
    def get( configfile=None, reread=False, logger=logging.getLogger("main"), dirmap={}, setdefault=False ):
        """Returns a Config object.

        Config objects are stored as an array of singletons.  That is,
        if you pass a config file that has been passed before in the
        current execution context, you'll get back exactly the same
        object each time.  If you pass a config file that hasn't been
        passed before, it will read the indicated configuration file,
        cache an object associated with it for future calls, and return
        that object.

        If neither this method nor Config.init() has been called
        previously, then the config object read this call will become
        the default config object.

        If "reread" is true, then the singleton object will be recreated
        from the config files.

        If you don't pass a config file, then you will get back the
        default config object.  If there is no default config object
        (because neither Config.get() nor Config.init() have been called
        previously), an exception will be raised.

        """
        if configfile is None:
            if Config._default is None:
                if Config._default_default is None:
                    raise RuntimeError( f'No default config defined yet; run Config.init(configfile)' )
                Config._default = Config._default_default
            configfile = Config._default

        configfile = str( pathlib.Path(configfile).resolve() )
                
        if reread or ( configfile not in Config._configs ):
            Config._configs[configfile] = Config( configfile, logger=logger, dirmap=dirmap )
            if Config._default is None:
                Config._default = configfile

        if setdefault:
            Config._default = configfile
                
        return Config._configs[configfile]

    @staticmethod
    def dirmap( filename, dirmap ):
        for olddir, newdir in dirmap.items():
            if filename[0:len(olddir)] == olddir:
                filename = f"{newdir}{filename[len(olddir):]}"
                break
        return filename

    @staticmethod
    def clone( configfile=None, reread=False, logger=logging.getLogger("main"), dirmap={} ):
        """Returns a config object.

        Will call "get" on the passed configfile, but will *not* return
        the singleton object for that config file.  RAther, will make a
        deep copy of it, and return that.  That gives you a config file
        that you can muck about with to your heart's content without
        worrying about messing things up elsewhere.
        """
        origconfig = Config.get( configfile, reread=reread, logger=logger, dirmap=dirmap )
        return Config( configfile, clone=origconfig, dirmap=dirmap )


    def __init__( self, configfile, clone=None, logger=logging.getLogger("main"), dirmap={} ):
        """Don't call this, call static method Config.get() or Config.clone()"""

        self.logger = logger
        if clone is not None:
            self._data = copy.deepcopy( clone._data )
            return

        try:
            self._data = {}
            self._path = pathlib.Path( configfile ).resolve()
            curfiledata = yaml.safe_load( open(self._path) )
            if not isinstance( curfiledata, dict ):
                raise RuntimeError( f'Config file {configfile} doesn\'t have yaml I like.' )

            imports = { 'preloads': [], 'augments': [], 'overrides': [] }
            for importfile in [ 'preloads', 'augments', 'overrides' ]:
                if importfile in curfiledata:
                    if not isinstance( imports[importfile], list ):
                        raise TypeError( 'preloads must be a list' )
                    imports[importfile] = [ Config.dirmap( f, dirmap ) for f in curfiledata[importfile] ]
                    del curfiledata[importfile]

            for preloadfile in imports['preloads']:
                self.override( preloadfile, dirmap=dirmap )

            self._data = Config.merge_trees( self._data, curfiledata )

            for augmentfile in imports['augments']:
                self.augment( augmentfile, dirmap=dirmap )

            for overridefile in imports['overrides']:
                self.override( overridefile, dirmap=dirmap )

        except Exception as e:
            logger.exception( f'Exception trying to load config from {configfile}' )
            raise e

    def augment( self, augmentfile, dirmap={} ):
        """Read file (or path) augmentfile and augment config data.

        * If the old and new items have different types (scalar vs. list
          vs. dict), the new value replaces the old value.

        * If the value is a scalar, the new value replaces the old value.

        * If the value is a list, extend the existing list with what's
          present in the new file.

        * If the value is a dict, then merge the two dictionaries.  New
          keys are added.  When the key is present in both dictionaries,
          toss out the old subtree in favor of the new one.
        """
        augmentpath = pathlib.Path( augmentfile )
        if not augmentpath.is_absolute():
            augmentpath = ( self._path.parent / augmentfile ).resolve()
        augment = Config( augmentpath, logger=self.logger, dirmap=dirmap )._data
        self._data = Config.merge_trees( self._data, augment, augment=True )

    def override( self, overridefile, dirmap=dirmap ):
        """Read file (or path) overridefile and override config data.

        * If the old and new items have different types (scalar vs. list
          vs. dict), the new value replaces the old value.

        * If the value is a scalar, the new value replaces the old value.

        * If the value is a list, the old list is tossed out in favor of
          the new list.

        * If the value is a dict, then merge the two dictionaries.  New
          keys are added.  When the key is present in both dictionaries,
          recurse into the conflict rules.
        """
        overridepath = pathlib.Path( overridefile )
        if not overridepath.is_absolute():
            overridepath = ( self._path.parent / overridefile ).resolve()
        override = Config( overridepath, logger=self.logger, dirmap=dirmap )._data
        self._data = Config.merge_trees( self._data, override )

    def value( self, field, struct=None ):
        """Get a value from the config structure.

        For trees, separate fields by periods.  If there is
        an array somewhere in the tree, then the array index
        as a number is the field for that branch.

        For example, if the config yaml file is;

        scalar: value

        dict1:
          dict2:
            sub1: 2level1
            sub2: 2level2

        dict3:
          list:
            - list0
            - list1

        then you could get values with:

        configobj.value( "scalar" ) --> returns "value"
        configobj.value( "dict1.dict2.sub2" ) --> returns "2level2"
        configobj.value( "dict3.list.1" ) --> returns "list1"

        You can also specify a branch to get back the rest of the
        subtree; for instance configobj.value( "dict1.dict2" ) would
        return the dictionary { "sub1": "2level1", "sub2": "2level2" }.
        """

        if struct is None:
            struct = self._data
        fields, isleaf, curfield, ifield = self._fieldsep( field )

        if isinstance( struct, list ):
            if ifield is None:
                raise ValueError( f'Failed to parse {curfield} as an integer index' )
            if ifield >= len(struct):
                raise ValueError( f'{ifield} > {len(struct)}, the length of the list' )
            if isleaf:
                return struct[ifield]
            else:
                try:
                    return self.value( ".".join(fields[1:]), struct[ifield] )
                except Exception as e:
                    traceback.print_exc()
                    raise ValueError( f'Error getting list element {ifield}' )
        elif isinstance( struct, dict ):
            if curfield not in struct:
                raise ValueError( f'Field {curfield} doesn\'t exist' )
            if isleaf:
                return struct[curfield]
            else:
                try:
                    return self.value( ".".join(fields[1:]), struct[curfield] )
                except Exception as e:
                    traceback.print_exc()
                    raise ValueError( f'Error getting field {curfield}' )
        else:
            if not isleaf:
                raise ValueError( f'Tried to get field {curfield} of scalar!' )
            return struct

    def set_value( self, field, value, structpass=None, appendlists=False ):
        """Set a value in the singleton for the current session.

        Does not save to disk.  Follows the standard rules docuemnted in
        "augment" and "override"; if appendlists is True, uses
        "augment", else "override".  Will create the whole hierarchy if
        necessary.

        """

        if structpass is None:
            structpass = types.SimpleNamespace()
            structpass.struct = self._data
        elif not hasattr( structpass, 'struct' ):
            raise ValueError( 'structpass must have a field "struct"' )
        fields, isleaf, curfield, ifield = self._fieldsep( field )

        if isleaf:
            if isinstance( structpass.struct, list ):
                if appendlists:
                    if ifield is None:
                        raise TypeError( "Tried to add a non-integer field to a list." )
                    structpass.struct.append( value )
                else:
                    if ifield is None:
                        structpass.struct = { curfield: value }
                    else:
                        structpass.struct = [ value ]
            elif isinstance( structpass.struct, dict ):
                if ifield is not None:
                    raise TypeError( "Tried to add an integer field to a dict." )
                structpass.struct[curfield] = value
            else:
                structpass.struct = { curfield: value }
        else:
            structchuck = types.SimpleNamespace()
            try:
                nextifield = int( fields[1] )
            except ValueError:
                nextifield = None

            if isinstance( structpass.struct, list ):
                structchuck.struct = {} if nextifield is None else []
                self.set_value( ".".join(fields[1:], value, structchuck, appendlists=appendlists ) )
                if appendlists:
                    if ifield is None:
                        raise TypeError( "Tried to add a non-integer field to a list" )
                    structpass.struct.append( structchuck.struct )
                else:
                    if ifield is None:
                        structpass.struct = { curfield: structchuck.struct }
                    else:
                        structpass.struct = [ structchuck.struct ]
            else:
                if ifield is None:
                    if isinstance( structpass.struct, dict ):
                        if curfield in structpass.struct:
                            structchuck.struct = structpass.struct[curfield]
                        else:
                            structchuck.struct = {} if nextifield is None else []
                    else:
                        structpass.struct = {}
                    self.set_value( ".".join(fields[1:]), value, structchuck, appendlists=appendlists )
                    structpass.struct[curfield] = structchuck.struct
                else:
                    if isinstance( structpass.struct, dict ):
                        raise TypeError( "Tried to add an integer field to a dict" )
                    structchuck.struct = {} if nextifield is None else []
                    self.set_value( ".".join(fields[1:]), value, structchuck, appendlists=appendlists )
                    structpass.struct = [ structchuck.struct ]

    @classmethod
    def _fieldsep( cls, field ):
        """Parses a period-separated config specifier string.
        Returns:
          fields : list of the hierarchy (e.g. "val1.val2.val3" returns ["val1","val2","val3"])
          isleaf : True if len(fields) is 1, otherwise false
          curfield : The first element of the field (val1 in the example above)
          ifield : None if curfield is not an integer, otherwise the integer value of curfield
        """
        fields = field.split( "." )
        isleaf = ( len(fields) == 1 )
        curfield = fields[0]
        try:
            ifield = int(curfield)
        except ValueError:
            ifield = None
        return fields, isleaf, curfield, ifield

    @staticmethod
    def merge_trees( left, right, augment=False ):
        """Internal usage, do not call."""

        if isinstance( left, list ):
            if not isinstance( right, list ) or ( not augment ):
                return copy.deepcopy( right )
            else:
                newlist = copy.deepcopy( left )
                newlist.extend( copy.deepcopy( right ) )
                return newlist
        elif isinstance( left, dict ):
            if not isinstance( right, dict ):
                return copy.deepcopy( right )
            newdict = copy.deepcopy( left )
            for key, value in right.items():
                if key in newdict:
                    newdict[key] = Config.merge_trees( newdict[key], right[key], augment=augment )
                else:
                    newdict[key] = copy.deepcopy( right[key] )
            return newdict
        else:
            return copy.deepcopy( right )



if __name__ == "__main__":
    main()
