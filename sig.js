;(function() {
  sig.reset = reset
  sig.push = push
  sig.receive = receive
  sig.watch = watch
  sig.unwatch = unwatch
  sig.map = map


  function sig(receiver) {
    return {
      type: 'sig',
      sources: [],
      targets: [],
      receiver: receiver || noop
    }
  }


  function reset(s) {
    s.sources.map(function(source) { untarget(source, s) })
    s.targets.map(function(target) { unsource(s, target) })
    s.sources = []
    s.targets = []
    return s
  }


  function watch(s, t) {
    s.targets.push(t)
    t.sources.push(s)
  }


  function untarget(s, t) {
    rm(s.targets, t)
  }


  function unsource(s, t) {
    rm(t.sources, s)
  }


  function unwatch(s, t) {
    unsource(s, t)
    untarget(s, t)
  }


  function push(s, x) {
    var targets = s.targets
    var i = -1
    var n = targets.length
    while (++i < n) receive(targets[i], x)
    return s
  }


  function receive(s, x) {
    s.receiver(x, s)
    return s
  }


  function map(s, fn) {
    var t = sig(mapper(fn))
    watch(s, t)
    return t
  }


  function mapper(fn) {
    return function(x, t) {
      push(t, fn(x))
    }
  }


  function rm(arr, x) {
    var i = arr.indexOf(x)
    if (i < 0) return
    arr.splice(i, 1)
  }


  function noop() {}


  if (typeof module != 'undefined') {
    module.exports = sig
  }
  else if (typeof define == 'function' && define.amd) {
    define(function() {
      return sig
    })
  }
  else {
    this.sig = sig
  }
}).call(this);
