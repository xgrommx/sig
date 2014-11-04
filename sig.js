;(function() {
  sig.reset = reset
  sig.push = push
  sig.receive = receive
  sig.watch = watch
  sig.unwatch = unwatch
  sig.pause = pause
  sig.resume = resume
  sig.map = map
  sig.filter = filter
  sig.limit = limit
  sig.once = once
  sig.then = then
  sig.isSig = isSig
  sig.spread = spread
  sig.depend = depend
  sig.undepend = undepend
  sig.any = any


  function sig(obj) {
    if (isSig(obj)) return obj

    var s = {
      type: 'sig',
      paused: true,
      sources: [],
      targets: [],
      buffer: [],
      dependants: [],
      receiver: noop
    }

    if (Array.isArray(obj)) s.buffer = obj
    else if (typeof obj == 'function') s.receiver = obj

    return s
  }


  function reset(s) {
    s.sources.forEach(function(source) { untarget(s, source) })
    s.targets.forEach(function(target) { unsource(target, s) })
    s.dependants.forEach(reset)
    s.buffer = []
    s.sources = []
    s.targets = []
    s.dependants = []
    return s
  }


  function watch(t, s) {
    unwatch(t, s)
    s.targets.push(t)
    t.sources.push(s)
    return t
  }


  function depend(t, s) {
    undepend(t, s)
    s.dependants.push(t)
    return t
  }


  function undepend(t, s) {
    rm(s.dependants, t)
    return t
  }


  function untarget(t, s) {
    rm(s.targets, t)
    return t
  }


  function unsource(t, s) {
    rm(t.sources, s)
    return t
  }


  function unwatch(t, s) {
    unsource(t, s)
    untarget(t, s)
    return t
  }


  function push(s, x) {
    return s.paused
      ? buffer(s, x)
      : send(s, x)
  }


  function receive(s, x) {
    s.receiver(x, s)
    return s
  }


  function pause(s) {
    s.paused = true
  }


  function resume(s) {
    s.paused = false
    flush(s)
  }


  function flush(s) {
    var buffer = s.buffer
    var i = -1
    var n = buffer.length
    while (++i < n) send(s, buffer[i])
    s.buffer = []
  }


  function send(s, x) {
    var targets = s.targets
    var i = -1
    var n = targets.length
    while (++i < n) receive(targets[i], x)
    return s
  }


  function buffer(s, x) {
    s.buffer.push(x)
    return s
  }


  function map(s, fn) {
    var t = sig(function(x, t) {
      push(t, fn(x, t))
    })

    watch(t, s)
    resume(s)
    return t
  }


  function filter(s, fn) {
    var t = sig(function(x, t) {
      if (fn(x, t)) push(t, x)
    })

    watch(t, s)
    resume(s)
    return t
  }


  function limit(s, n) {
    var i = 0

    var t = sig(function(x, t) {
      if (++i > n) reset(t)
      else push(t, x)
    })

    watch(t, s)
    resume(s)
    return t
  }


  function once(s) {
    return limit(s, 1)
  }


  function then(s, fn) {
    return map(once(s), fn)
  }


  function any(values) {
    var out = sig()

    each(values, function(s, k) {
      if (!sig.isSig(s)) return
      sig.depend(sig.map(s, pusher(k)), out)
    })

    function pusher(k) {
      return function(x, t) {
        sig.push(out, [x, k])
      }
    }

    return out
  }


  function isSig(s) {
    return (s || 0).type == 'sig'
  }


  function spread(fn) {
    return function(values) {
      var args = arguments.length > 1
        ? values.concat(Array.prototype.slice.call(arguments, 1))
        : values
      return fn.apply(fn, args)
    }
  }


  function each(obj, fn) {
    if (Array.isArray(obj)) return obj.forEach(fn)
    for (var k in obj) if (obj.hasOwnProperty(k)) fn(obj[k], k)
  }


  function rm(arr, x) {
    var i = arr.indexOf(x)
    if (i < 0) return
    arr.splice(i, 1)
  }


  function noop() {}


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
