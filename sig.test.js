var assert = require('assert')
var sig = require('./sig')
var vv = require('drainpipe')


function capture(s) {
  var values = []

  sig.map(s, function(x) {
    values.push(x)
  })

  return values
}


describe("sig", function() {
  it("should support signal pausing and resuming", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x, t) { sig.put(t, x) }

    var u = sig()
    u.receiver = function(x) { results.push(x) }

    sig.watch(t, s)
    sig.watch(u, t)

    sig.put(s, 1)
    assert(!results.length)

    sig.resume(s)
    assert(!results.length)

    sig.resume(t)
    assert.deepEqual(results, [1])

    sig.put(s, 2)
    assert.deepEqual(results, [1, 2])

    sig.pause(t)
    sig.put(s, 3)
    assert.deepEqual(results, [1, 2])

    sig.resume(t)
    assert.deepEqual(results, [1, 2, 3])

    sig.pause(s)
    sig.put(s, 4)

    sig.resume(s)
    assert.deepEqual(results, [1, 2, 3, 4])
  })

  it("should allow multiple source signals", function() {
    var results = []
    var s1 = sig()
    var s2 = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    sig.resume(t)
    sig.resume(s1)
    sig.resume(s2)

    sig.watch(t, s1)
    sig.watch(t, s2)

    sig.put(s1, 1)
    sig.put(s2, 2)
    sig.put(s1, 3)
    sig.put(s2, 4)

    assert.deepEqual(results, [1, 2, 3, 4])
  })

  it("should allow multiple target signals", function() {
    var results1 = []
    var results2 = []
    var s = sig()

    var t1 = sig()
    t1.receiver = function(x) { results1.push(x) }

    var t2 = sig()
    t2.receiver = function(x) { results2.push(x) }

    sig.resume(s)
    sig.resume(t1)
    sig.resume(t2)

    sig.watch(t1, s)
    sig.watch(t2, s)

    vv(s)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)
      (sig.put, 4)

    assert.deepEqual(results1, [1, 2, 3, 4])
    assert.deepEqual(results2, [1, 2, 3, 4])
  })

  it("should allow a target signal to be reset", function() {
    var results = []
    var s1 = sig()
    var s2 = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    sig.resume(s1)
    sig.resume(s2)
    sig.resume(t)

    sig.watch(t, s1)
    sig.watch(t, s2)
    sig.reset(t)

    sig.put(s1, 1)
    sig.put(s2, 2)
    sig.put(s1, 3)
    sig.put(s2, 4)

    assert(!results.length)
  })

  it("should allow a source signal to be reset", function() {
    var results1 = []
    var results2 = []
    var s = sig()

    var t1 = sig()
    t1.receiver = function(x) { results1.put(x) }

    var t2 = sig()
    t2.receiver = function(x) { results2.put(x) }

    sig.resume(s)
    sig.resume(t1)
    sig.resume(t2)

    sig.watch(t1, s)
    sig.watch(t2, s)
    sig.reset(s)

    vv(s)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)
      (sig.put, 4)

    assert(!results1.length)
    assert(!results2.length)
  })

  it("should allow a signal to stop watching another", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    sig.resume(s)
    sig.resume(t)

    sig.watch(t, s)
    sig.unwatch(t, s)

    vv(s)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)
      (sig.put, 4)

    assert(!results.length)
  })

  it("should support signal dependencies", function() {
    var s = sig()
    var t = sig()
    var u = sig()
    var results = capture(u)

    sig.depend(t, s)
    sig.depend(u, t)

    vv(u)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)

    assert.deepEqual(results, [1, 2, 3])

    sig.reset(s)

    vv(u)
      (sig.put, 4)
      (sig.put, 5)
      (sig.put, 6)

    assert.deepEqual(results, [1, 2, 3])
  })

  it("should allow signals to stop depending on other signals", function() {
    var s = sig()
    var t = sig()
    var u = sig()
    var results = capture(u)

    sig.depend(t, s)
    sig.depend(u, t)
    sig.undepend(u, t)
    sig.reset(s)

    vv(u)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)

    assert.deepEqual(results, [1, 2, 3])
  })

  it("should prevent duplicate sources", function() {
    var s = sig()
    var t = sig()
    sig.watch(t, s)
    sig.watch(t, s)
    assert.equal(t.sources.length, 1)
  })

  it("should prevent duplicate targets", function() {
    var s = sig()
    var t = sig()
    sig.watch(t, s)
    sig.watch(t, s)
    assert.equal(s.targets.length, 1)
  })

  it("should prevent duplicate dependencies", function() {
    var s = sig()
    var t = sig()
    sig.depend(t, s)
    sig.depend(t, s)
    assert.equal(s.dependants.length, 1)
  })

  it("should act as an identity for existing signals", function() {
    var s = sig()
    assert.strictEqual(sig(s), s)
  })

  it("should create a signal from an array of values", function() {
    vv([23])
      (sig)
      (capture)
      (assert.deepEqual, [23])

    vv([1, 2, 3, 4])
      (sig)
      (capture)
      (assert.deepEqual, [1, 2, 3, 4])
  })

  it("should create a signal from a single value", function() {
    vv(23)
      (sig)
      (capture)
      (assert.deepEqual, [23])
  })
})


describe("sig.map", function() {
  it("should map the given signal", function() {
    vv([1, 2, 3, 4])
      (sig)
      (sig.map, function(x) { return x * 2 })
      (sig.map, function(x) { return x + 1 })
      (capture)
      (assert.deepEqual, [3, 5, 7, 9])
  })

  it("should allow additional args", function() {
    function fn(a, b, c) {
      return [a, b, c]
    }

    vv([1, 2, 3, 4])
      (sig)
      (sig.map, fn, 23, 32)
      (capture)
      (assert.deepEqual, [
        [1, 23, 32],
        [2, 23, 32],
        [3, 23, 32],
        [4, 23, 32]])
  })
})


describe("sig.filter", function() {
  it("should filter the given signal", function() {
    vv([2, 3, 4, 5, 6, 11, 12, 15, 16])
      (sig)
      (sig.filter, function(x) { return x % 2 })
      (sig.filter, function(x) { return x < 10 })
      (capture)
      (assert.deepEqual, [3, 5])
  })

  it("should allow additional args", function() {
    function fn(a, b, c) {
      return (a * b) % c
    }

    vv([1, 2, 3, 4])
      (sig)
      (sig.filter, fn, 3, 2)
      (capture)
      (assert.deepEqual, [1, 3])
  })
})


describe("sig.limit", function() {
  it("should limit the given signal", function() {
    vv([1, 2, 3, 4, 5, 6])
      (sig)
      (sig.limit, 3)
      (capture)
      (assert.deepEqual, [1, 2, 3])
  })
})


describe("sig.once", function() {
  it("should limit a signal to its first output", function() {
    vv([1, 2, 3, 4, 5, 6])
      (sig)
      (sig.once)
      (capture)
      (assert.deepEqual, [1])
  })
})


describe("sig.then", function() {
  it("should only map a signal's first output", function() {
    vv([1, 2, 3, 4])
      (sig)
      (sig.then, function(x) {
        return x + 1
      })
      (capture)
      (assert.deepEqual, [2])
  })

  it("should allow additional args", function() {
    function fn(a, b, c) {
      return [a, b, c]
    }

    vv([1, 2, 3, 4])
      (sig)
      (sig.then, fn, 23, 32)
      (capture)
      (assert.deepEqual, [[1, 23, 32]])
  })
})


describe("sig.isSig", function() {
  it("should determine whether something is a signal", function() {
    assert(!sig.isSig(void 0))
    assert(!sig.isSig(null))
    assert(!sig.isSig({}))
    assert(sig.isSig(sig()))
  })
})


describe("sig.spread", function() {
  it("should spread an array out as a function's arguments", function() {
    vv([1, 2, 3])
      (sig.spread(function(a, b, c) {
        return [a + 1, b + 1, c + 1]
      }))
      (sig.spread(function(a, b, c) {
        return [a * 2, b * 2, c * 2]
      }))
      (assert.deepEqual, [4, 6, 8])
  })

  it("should append additional args", function() {
    var fn = sig.spread(function(a, b, c, d) {
      return [a, b, c, d]
    })

    assert.deepEqual(fn([1, 2], 3, 4), [1, 2, 3, 4])
  })
})


describe("sig.any", function() {
  it("should support arrays with both signals and non-signals", function() {
    var a = sig()
    var b = sig()

    var results = vv([a, b, 23])
      (sig.any)
      (capture)
      ()

    assert(!results.length)

    sig.put(a, 1)
    assert.deepEqual(results, [[1, 0]])

    sig.put(b, 2)
    assert.deepEqual(results, [[1, 0], [2, 1]])

    sig.put(a, 3)
    assert.deepEqual(results, [[1, 0], [2, 1], [3, 0]])

    sig.put(b, 4)
    assert.deepEqual(results, [[1, 0], [2, 1], [3, 0], [4, 1]])
  })
  
  it("should support objects with both signals and non-signals", function() {
    var a = sig()
    var b = sig()

    var results = vv({
        a: a,
        b: b,
        c: 23
      })
      (sig.any)
      (capture)
      ()

    assert(!results.length)

    sig.put(a, 1)
    assert.deepEqual(results, [[1, 'a']])

    sig.put(b, 2)
    assert.deepEqual(results, [[1, 'a'], [2, 'b']])

    sig.put(a, 3)
    assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a']])

    sig.put(b, 4)
    assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a'], [4, 'b']])
  })

  it("should reset all its listeners when the out signal is reset", function() {
    var a = sig()
    var b = sig()
    var s = sig.any([a, b])
    assert.equal(a.targets.length, 1)
    assert.equal(b.targets.length, 1)

    sig.reset(s)
    assert(!a.targets.length)
    assert(!b.targets.length)
  })
})


describe("sig.all", function() {
  it("should support arrays with only non signals", function() {
    vv([21, 22, 23])
     (sig.all)
     (capture)
     (assert.deepEqual, [[21, 22, 23]])
  })

  it("should support objects with only non signals", function() {
    vv({
       a: 21,
       b: 22,
       c: 23
      })
      (sig.all)
      (capture)
      (assert.deepEqual, [{
        a: 21,
        b: 22,
        c: 23
      }])
  })

  it("should support arrays with both signals and non-signals", function() {
    var a = sig()
    var b = sig()

    var results = vv([a, b, 23])
      (sig.all)
      (capture)
      ()

    assert(!results.length)

    sig.put(a, 1)
    assert(!results.length)

    sig.put(b, 2)
    assert.deepEqual(results, [[1, 2, 23]])

    sig.put(a, 3)
    assert.deepEqual(results, [[1, 2, 23], [3, 2, 23]])

    sig.put(b, 4)
    assert.deepEqual(results, [[1, 2, 23], [3, 2, 23], [3, 4, 23]])
  })
  
  it("should support objects with both signals and non-signals", function() {
    var a = sig()
    var b = sig()

    var results = vv({
        a: a,
        b: b,
        c: 23 
      })
      (sig.all)
      (capture)
      ()

    assert(!results.length)

    sig.put(a, 1)

    assert(!results.length)

    sig.put(b, 2)

    assert.deepEqual(results, [{
      a: 1,
      b: 2,
      c: 23
    }])

    sig.put(a, 3)

    assert.deepEqual(results, [{
      a: 1,
      b: 2,
      c: 23
    }, {
      a: 3,
      b: 2,
      c: 23
    }])

    sig.put(b, 4)

    assert.deepEqual(results, [{
      a: 1,
      b: 2,
      c: 23
    }, {
      a: 3,
      b: 2,
      c: 23
    }, {
      a: 3,
      b: 4,
      c: 23
    }])
  })

  it("should output copies of a given array", function() {
    var a = sig()

    var results = vv([a, 23])
      (sig.all)
      (capture)
      ()

    sig.put(a, 1)
    sig.put(a, 2)
    sig.put(a, 3)

    assert.equal(results.length, 3)
    assert.notStrictEqual(results[0], results[1])
    assert.notStrictEqual(results[1], results[2])
    assert.notStrictEqual(results[2], results[0])
  })

  it("should output copies of a given object", function() {
    var a = sig()

    var results = vv({
        a: a,
        b: 23
      })
      (sig.all)
      (capture)
      ()

    sig.put(a, 1)
    sig.put(a, 2)
    sig.put(a, 3)

    assert.equal(results.length, 3)
    assert.notStrictEqual(results[0], results[1])
    assert.notStrictEqual(results[1], results[2])
    assert.notStrictEqual(results[2], results[0])
  })

  it("should reset all its listeners when the out signal is reset", function() {
    var a = sig()
    var b = sig()
    var s = sig.all([a, b])
    assert.equal(a.targets.length, 1)
    assert.equal(b.targets.length, 1)

    sig.reset(s)
    assert(!a.targets.length)
    assert(!b.targets.length)
  })

  it("should work with signals with non-empty buffers", function() {
    var a = sig()
    sig.put(a, 1)

    var b = sig()
    sig.put(b, 2)

    vv([a, b])
      (sig.all)
      (capture)
      (assert.deepEqual, [[1, 2]])
  })
})


describe("sig.ensure", function() {
  it("should simply pass through existing signals", function() {
    vv([1, 2])
      (sig)
      (sig.ensure)
      (capture)
      (assert.deepEqual, [1, 2])
  })

  it("should create a singleton signal from non-signals", function() {
    vv(23)
      (sig.ensure)
      (capture)
      (assert.deepEqual, [23])

    vv([[1, 2], [3, 4]])
      (sig.ensure)
      (capture)
      (assert.deepEqual, [[[1, 2], [3, 4]]])
  })
})
