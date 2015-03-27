;(function() {
  var _nil_ = {}
  var _kill_ = {}

  var isArray = Array.isArray
  var _slice = Array.prototype.slice
  var _log = console.log


  function sig(obj) {
    if (sig.isSig(obj)) return obj

    var s = new Sig()
    s.targets = []
    s.source = null
    s.eager = true
    s.sticky = false
    s.processor = putNextProcessor
    s.errorHandler = raiseNextHandler
    s.paused = true
    s.current = _nil_
    s.inBuffer = []
    s.outBuffer = []
    s.error = null
    s.waiting = true
    s.killed = false
    s.disconnected = false
    s.eventListeners = {}

    if (obj) s.putMany(obj)
    return s
  }


  sig.val = function(v) {
    var s = sig()
    s.sticky = true
    if (arguments.length) s.put(v)
    return s
  }


  sig.ensure = function(v) {
    return !sig.isSig(v)
      ? sig([v])
      : v
  }


  sig.ensureVal = function(v) {
    return sig.isSig(v)
      ? v.then(sig.val())
      : sig.val(v)
  }


  sig.any = function(values) {
    var out = sig()
    if (isArguments(values)) values = sig.slice(values)

    each(values, function(s, k) {
      if (sig.isSig(s)) s.map(output, k).redir(out)
    })
    
    return out

    function output(v, k) {
      return [v, k]
    }
  }


  sig.all = function(values) {
    var out = sig()
    var remaining = {}
    values = copy(values)

    each(values, function(s, k) {
      if (sig.isSig(s)) remaining[k] = true
    })

    if (!isEmpty(remaining))
      each(values, function(s, k) {
        if (sig.isSig(s)) s.then(output, k).redir(out)
      })
    else
      out.put(values)

    return out

    function output(v, k) {
      delete remaining[k]
      values[k] = v
      if (isEmpty(remaining)) this.put(copy(values))
      this.next()
    }
  }


  sig.merge = function(values) {
    return sig.any(values)
      .map(sig.spread, sig.identity)
  }


  sig.isSig = function(s) {
    return s instanceof Sig
  }


  sig.spread = function(args, fn) {
    return fn.apply(this, args)
  }


  sig.log = function() {
    return _log.apply(console, arguments)
  }


  sig.prime = function(args, fn) {
    if (!args.length) return fn

    return function() {
      return fn.apply(this, sig.slice(arguments).concat(args))
    }
  }


  sig.slice = function(arr, a, b) {
    return _slice.call(arr, a, b)
  }


  sig.identity = function(v) {
    return v
  }


  sig.static = function(fn) {
    return function(that) {
      return fn.apply(that, sig.slice(arguments, 1))
    }
  }


  sig.to = function(v, s) {
    s.put(v)
  }


  sig.functor = function(v) {
    return typeof v != 'function'
      ? function() { return v }
      : v
  }


  sig.prototype.kill = function() {
    emit(this, 'kill')
    disconnect(this)
    this.put(_kill_)
    this.killed = true
    return this
  }


  sig.prototype.put = function(v) {
    if (this.sticky) this.current = v
    if (this.paused) buffer(this, v)
    else skill(this, v)
    return this
  }


  sig.prototype.next = function() {
    if (!this.inBuffer.length) this.waiting = true
    else process(this, this.inBuffer.shift())
    return this
  }


  sig.prototype.pause = function() {
    this.paused = true
    return this
  }


  sig.prototype.resume = function() {
    this.paused = false
    flush(this)
    return this
  }


  sig.prototype.raise = function(e) {
    if (!this.error) handleError(this, e)
    else propogateError(this, e)
    return this
  }


  sig.prototype.except = function(fn) {
    var t = sig()
    fn = sig.prime(sig.slice(arguments, 1), fn)
    t.errorHandler = fn
    this.then(t)
    return t
  }


  sig.prototype.then = function(obj) {
    return typeof obj == 'function'
      ? thenFn(this, obj, sig.slice(arguments, 1))
      : thenSig(this, obj)
  }


  sig.prototype.teardown = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn)
    if (this.killed) fn.call(this)
    else on(this, 'kill', fn)
    return this
  }


  sig.prototype.map = function(fn) {
    fn = sig.functor(fn)
    fn = sig.prime(sig.slice(arguments, 1), fn)

    return this.then(function() {
      this.put(fn.apply(this, arguments)).next()
    })
  }


  sig.prototype.filter = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn || sig.identity)

    return this.then(function(v) {
      if (fn.apply(this, arguments)) this.put(v)
      this.next()
    })
  }


  sig.prototype.flatten = function() {
    return this.then(function(v) {
      deepEach(v, sig.to, this)
      this.next()
    })
  }


  sig.prototype.limit = function(n) {
    var i = 0
    
    return this.then(function(v) {
      if (++i <= n) this.put(v).next()
      if (i >= n) this.kill()
    })
  }


  sig.prototype.once = function() {
    return this.limit(1)
  }


  sig.prototype.redir = function(t) {
    var u = this
      .then(function(v) {
        t.put(v)
        this.next()
      })
      .except(function(e) {
        t.raise(e)
        this.next()
      })

    on(t, 'disconnect', disconnect, u)
    return u
  }


  sig.prototype.resolve = function(v) {
    this.put(v).kill()
    return this
  }


  sig.prototype.putMany = function(values) {
    var n = values.length
    var i = -1
    while (++i < n) this.put(values[i])
    return this
  }


  sig.prototype.to = function(s) {
    s.put(this)
  }


  sig.prototype.update = function(fn) {
    var curr
    var out = sig()
    fn = sig.prime(sig.slice(arguments, 1), fn || sig.identity)

    this
      .then(function(v) {
        if (curr) curr.kill()
        var u = fn(v)
        if (sig.isSig(u)) curr = u.redir(out)
        this.next()
      })
      .redir(out)

    return out
  }


  sig.prototype.appkill = function(fn) {
    var out = sig()
    fn = sig.prime(sig.slice(arguments, 1), fn || sig.identity)

    this
      .then(function(v) {
        var u = fn(v)
        if (sig.isSig(u)) u.redir(out)
        this.next()
      })
      .redir(out)

    return out
  }


  sig.prototype.call = function(fn) {
    return fn.apply(this, [this].concat(sig.slice(arguments, 1)))
  }


  function putNextProcessor(v) {
    this.put(v).next()
  }


  function raiseNextHandler(e) {
    this.raise(e).next()
  }


  function connect(s, t) {
    var firstTarget = !s.targets.length

    setSource(t, s)
    addTarget(s, t)

    if (s.disconnected) reconnect(s)
    if (s.eager && firstTarget) s.resume()
    else if (s.sticky && s.current != _nil_) receive(t, s.current)
  }


  function disconnect(t) {
    if (t.disconnected) return t
    var s = t.source

    if (s) {
      rmTarget(s, t)
      if (!s.targets.length) disconnect(s)
    }

    t.disconnected = true
    emit(t, 'disconnect')
  }


  function reconnect(t) {
    var s = t.source

    if (s) {
      rmTarget(s, t)
      addTarget(s, t)
      reconnect(s)
    }

    t.disconnected = false
    emit(t, 'reconnect')
  }


  function addTarget(s, t) {
    s.targets.push(t)
  }


  function rmTarget(s, t) {
    rm(s.targets, t)
  }


  function setSource(t, s) {
    if (t.source) t.raise(new Error(
      "Cannot set signal's source, signal already has a source"))
    else t.source = s
  }


  function process(s, v) {
    if (v == _kill_) s.kill()
    else s.processor(v)
  }


  function receive(s, v) {
    s.inBuffer.push(v)

    if (s.waiting) {
      s.waiting = false
      s.next()
    }
  }


  function skill(s, v) {
    var targets = sig.slice(s.targets)
    var i = -1
    var n = targets.length
    while (++i < n) receive(targets[i], v)
  }


  function buffer(s, v) {
    s.outBuffer.push(v)
  }


  function flush(s) {
    var buffer = s.outBuffer
    var i = -1
    var n = buffer.length
    while (++i < n) skill(s, buffer[i])
    s.outBuffer = []
  }


  function handleError(s, e) {
    s.error = e
    try { s.errorHandler.call(s, e) }
    finally { s.error = null }
  }


  function propogateError(s, e) {
    var targets = s.targets
    var n = targets.length
    if (!n) throw e

    var i = -1
    while (++i < n) targets[i].raise(e)
  }


  function thenFn(s, fn, args) {
    var t = sig()
    t.processor = sig.prime(args, fn)
    thenSig(s, t)
    return t
  }


  function thenSig(s, t) {
    connect(s, t)
    return t
  }


  function on(s, event, fn) {
    fn = sig.prime(sig.slice(arguments, 3), fn)
    var listeners = s.eventListeners[event] || []
    s.eventListeners[event] = listeners
    listeners.push(fn)
  }


  function emit(s, event) {
    var args = sig.slice(arguments, 2)
    var listeners = sig.slice(s.eventListeners[event] || [])
    var n = listeners.length
    var i = -1
    while (++ i < n) listeners[i].apply(s, args)
  }


  function deepEach(arr, fn) {
    fn = sig.prime(sig.slice(arguments, 2), fn)
    if (!isArray(arr)) return fn(arr)
    var i = -1
    var n = arr.length
    while (++i < n) deepEach(arr[i], fn)
  }


  function each(obj, fn) {
    if (Array.isArray(obj)) return obj.forEach(fn)
    for (var k in obj) if (obj.hasOwnProperty(k)) fn(obj[k], k)
  }


  function isEmpty(obj) {
    var k
    for (k in obj) return false
    return true
  }


  function copy(obj) {
    if (isArray(obj) || isArguments(obj)) return sig.slice(obj)
    var result = {}
    for (var k in obj) if (obj.hasOwnProperty(k)) result[k] = obj[k]
    return result
  }


  function rm(arr, v) {
    var i = arr.indexOf(v)
    if (i < 0) return
    arr.splice(i, 1)
  }


  function isArguments( obj ) {
    return typeof obj == 'object'
        && typeof obj.length == 'number'
        && 'callee' in obj
  }


  sig.put = sig.static(sig.prototype.put)
  sig.next = sig.static(sig.prototype.next)
  sig.kill = sig.static(sig.prototype.kill)
  sig.resolve = sig.static(sig.prototype.resolve)
  sig.putMany = sig.static(sig.prototype.putMany)
  sig.receive = sig.static(sig.prototype.receive)
  sig.pause = sig.static(sig.prototype.pause)
  sig.resume = sig.static(sig.prototype.resume)
  sig.raise = sig.static(sig.prototype.raise)
  sig.except = sig.static(sig.prototype.except)
  sig.teardown = sig.static(sig.prototype.teardown)
  sig.map = sig.static(sig.prototype.map)
  sig.filter = sig.static(sig.prototype.filter)
  sig.flatten = sig.static(sig.prototype.flatten)
  sig.limit = sig.static(sig.prototype.limit)
  sig.once = sig.static(sig.prototype.once)
  sig.then = sig.static(sig.prototype.then)
  sig.redir = sig.static(sig.prototype.redir)
  sig.update = sig.static(sig.prototype.update)
  sig.appkill = sig.static(sig.prototype.appkill)
  sig.call = sig.static(sig.prototype.call)


  function Sig() {}
  Sig.prototype = sig.prototype


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
