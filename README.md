# @mconnect/crud-mg

- mConnect MongoDB CRUD operations, crud-mongo re-write

## Installation

```sh
$ npm install @mconnect/crud-mg
```

## APIs

// Classes' signatures
GetAllRecord(params : object, appDb : function, options : object = {}) : array
GetAllRecords(params : object, appDb : function, options : object = {}) : array


## Example

```js
// Coming soon
const {GetAllRecord, newGetAllRecord} = require('@mconnect/crud-mg');

// instance call
const itemInstance = new GetAllRecord({coll: 'services', }, appDb, options = {});

// instance wrapper function call
const itemFactory = newGetAllRecord({coll: 'services', }, appDb, options = {});


```
