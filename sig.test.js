var sig = require('./sig'),
    assert = require('assert')


function capture(s, fn) {
  var results = []
  fn = sig.prime(sig.slice(arguments, 2), fn || sig.identity)

  s.then(function(v) {
    results.push(v)
    this.next()
  })

  return fn(results)
}


describe("sig", function() {
  it("should allow values to be sent through signals", function() {
    var src = sig()
    var results = []

    src
      .then(function(x) {
        if (x % 2) this.put(x)
        this.next()
      })
      .then(function(x) {
        this.put(x + 1).next()
      })
      .then(function(x) {
        results.push(x)
        this.next()
      })

    assert(!results.length)

    src.put(1)
    assert.deepEqual(results, [2])

    src.put(2)
    assert.deepEqual(results, [2])

    src.put(3)
    assert.deepEqual(results, [2, 4])
  })

  it("should support top-down disconnects", function() {
    var a = sig()
    var b = sig()
    var c = sig()
    var d = sig()
    var e = sig()

    a.then(b)
    b.then(c)
    b.then(d)
    //       a
    //       |
    //       v
    //  ---- b      
    // |     |
    // v     v
    // c     d     e
    assert(!a.disconnected)
    assert(!b.disconnected)
    assert(!c.disconnected)
    assert(!d.disconnected)
    assert(!e.disconnected)
    assert.deepEqual(a.targets, [b])
    assert.strictEqual(b.source, a)
    assert.deepEqual(b.targets, [c, d])
    assert.strictEqual(c.source, b)
    assert.strictEqual(d.source, b)

    a.kill()
    //       a
    //        
    //        
    //       b      
    //        
    //        
    // c     d     e
    assert(a.disconnected)
    assert(b.disconnected)
    assert(c.disconnected)
    assert(d.disconnected)
    assert(!e.disconnected)
    assert(!a.targets.length)
    assert.strictEqual(b.source, a)
    assert(!b.targets.length)
    assert.strictEqual(c.source, b)
    assert.strictEqual(d.source, b)

    b.then(e)
    //       a
    //       |
    //       v
    //       b ----
    //             |
    //             v
    // c     d     e
    assert(!a.disconnected)
    assert(!b.disconnected)
    assert(c.disconnected)
    assert(d.disconnected)
    assert(!e.disconnected)
    assert.deepEqual(a.targets, [b])
    assert.strictEqual(b.source, a)
    assert.deepEqual(b.targets, [e])
    assert.strictEqual(c.source, b)
    assert.strictEqual(d.source, b)
    assert.strictEqual(e.source, b)
  })

  it("should support bottom-up disconnects", function() {
    var a = sig()
    var b = sig()
    var c = sig()
    var d = sig()
    var e = sig()

    a.then(b)
    b.then(c)
    b.then(d)
    //       a
    //       |
    //       v
    //  ---- b      
    // |     |
    // v     v
    // c     d     e
    assert(!a.disconnected)
    assert(!b.disconnected)
    assert(!c.disconnected)
    assert(!d.disconnected)
    assert.deepEqual(a.targets, [b])
    assert.deepEqual(b.source, a)
    assert.deepEqual(b.targets, [c, d])
    assert.deepEqual(c.source, b)
    assert.strictEqual(d.source, b)

    c.kill()
    //       a
    //       |
    //       v
    //       b      
    //       |
    //       v
    // c     d     e
    assert(!a.disconnected)
    assert(!b.disconnected)
    assert(c.disconnected)
    assert(!d.disconnected)
    assert.deepEqual(a.targets, [b])
    assert.strictEqual(b.source, a)
    assert.deepEqual(b.targets, [d])
    assert.strictEqual(c.source, b)
    assert.strictEqual(d.source, b)

    d.kill()
    //       a
    //        
    //        
    //       b      
    //        
    //        
    // c     d     e
    assert(a.disconnected)
    assert(b.disconnected)
    assert(c.disconnected)
    assert(d.disconnected)
    assert(!a.targets.length)
    assert.strictEqual(b.source, a)
    assert(!b.targets.length)
    assert.strictEqual(c.source, b)
    assert.strictEqual(d.source, b)

    b.then(e)
    //       a
    //       |
    //       v
    //       b ----
    //             |
    //             v
    // c     d     e
    assert(!a.disconnected)
    assert(!b.disconnected)
    assert(c.disconnected)
    assert(d.disconnected)
    assert.deepEqual(a.targets, [b])
    assert.strictEqual(b.source, a)
    assert.deepEqual(b.targets, [e])
    assert.strictEqual(c.source, b)
    assert.strictEqual(d.source, b)
    assert.strictEqual(e.source, b)
  })

  it("should support signal killing", function() {
    var a = sig()
    var b = sig()
    var c = sig()
    var d = sig()
    var cValues = capture(c)
    var dValues = capture(d)

    a.then(b)
    b.then(c)
    b.then(d)

    assert(!a.disconnected)
    assert(!b.disconnected)
    assert(!c.disconnected)
    assert(!d.disconnected)
    assert(!cValues.length)
    assert(!dValues.length)

    b.put(1)
     .put(2)
     .put(3)
     .kill()

    assert(a.disconnected)
    assert(b.disconnected)
    assert(c.disconnected)
    assert(d.disconnected)
    assert.deepEqual(cValues, [1, 2, 3])
    assert.deepEqual(dValues, [1, 2, 3])
  })

  it("should support error handling", function(done) {
    var s = sig()
    var e = new Error(':/')

    s.errorHandler = function(caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    s.raise(e)
  })

  it("should throw unhandled errors", function() {
    function thrower() {
      sig().raise(new Error('o_O'))
    }

    assert.throws(thrower, /o_O/)
  })

  it("should unset errors even if error handlers throw errors", function() {
    var s = sig()

    try { s.raise('o_O') }
    catch (e) {}

    assert.strictEqual(s.error, null)
  })

  it("should allow handlers of killing signals to rethrow errors", function() {
    var s = sig()

    s.errorHandler = function(e) {
      s.raise(new Error(e + '!'))
    }

    function thrower() {
      s.raise(new Error('o_O'))
    }

    assert.throws(thrower, /o_O!/)
  })

  it("should allow errors to propogate", function() {
    var s1 = sig()
    var s2 = sig()
    var s3 = sig()
    var s4 = sig()
    var s3Err, s4Err

    var e1 = new Error('o_O')
    var e2 = new Error(':|')

    s1.then(s2)
    s2.then(s3)
    s2.then(s4)

    s1.errorHandler = function(caughtErr) {
      if (caughtErr.message != ':|') this.raise(caughtErr)
    }

    s3.errorHandler = function(caughtErr) {
      s3Err = caughtErr
    }

    s4.errorHandler = function(caughtErr) {
      s4Err = caughtErr
    }

    s1.raise(e1)
      .raise(e2)

    assert.strictEqual(s3Err, e1)
    assert.strictEqual(s4Err, e1)
  })

  it("should catch and raise errors raised in processors", function(done) {
    var s = sig()
    var t = sig()
    var e = new Error('o_O')

    t.processor = function() {
      t.raise(e)
    }

    t.errorHandler = function(caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    s.then(t)
    s.resolve()
  })

  it("should support signal pausing and resuming", function() {
    var results = []
    var s = sig()
    var t = sig()
    var u = sig()

    u.processor = function(v) {
      results.push(v)
      this.next()
    }

    s.then(t)
     .then(u)

    s.pause()
    t.pause()

    s.put(1)
    assert(!results.length)

    s.resume()
    assert(!results.length)

    t.resume()
    assert.deepEqual(results, [1])

    s.put(2)
    assert.deepEqual(results, [1, 2])

    t.pause()
    s.put(3)
    assert.deepEqual(results, [1, 2])

    t.resume()
    assert.deepEqual(results, [1, 2, 3])

    s.pause()
    s.put(4)

    s.resume()
    assert.deepEqual(results, [1, 2, 3, 4])
  })

  it("should not allow multiple source signals", function() {
    var t = sig()

    function addSource() {
      sig().then(t)
    }

    addSource()

    assert.throws(
        addSource,
        /Cannot set signal's source, signal already has a source/)
  })

  it("should allow multiple target signals", function() {
    var results1 = []
    var results2 = []
    var s = sig()
    var t1 = sig()
    var t2 = sig()

    t1.processor = function(x) {
      results1.push(x)
      this.next()
    }

    t2.processor = function(x) {
      results2.push(x)
      this.next()
    }

    s.then(t1)
    s.then(t2)

    s.put(1)
     .put(2)
     .put(3)
     .put(4)

    assert.deepEqual(results1, [1, 2, 3, 4])
    assert.deepEqual(results2, [1, 2, 3, 4])
  })

  it("should allow a target signal to kill", function() {
    var a = sig()
    var b = sig()
    var results = capture(b)
    a.then(b)

    assert(!a.disconnected)
    assert(!b.disconnected)

    a.put(1)
     .put(2)
     .put(3)

    b.kill()

    assert(a.disconnected)
    assert(b.disconnected)

    a.put(4)
    assert.deepEqual(results, [1, 2, 3])
  })

  it("should allow a source signal to kill", function() {
    var a = sig()
    var b = sig()
    var c = sig()
    var d = sig()
    var cValues = capture(c)
    var dValues = capture(d)

    a.then(b)
    b.then(c)
    b.then(d)

    assert(!a.disconnected)
    assert(!b.disconnected)
    assert(!c.disconnected)
    assert(!d.disconnected)
    assert(!cValues.length)
    assert(!dValues.length)

    b.put(1)
     .put(2)
     .put(3)
     .kill()

    assert(a.disconnected)
    assert(b.disconnected)
    assert(c.disconnected)
    assert(d.disconnected)

    b.put(4)
    assert.deepEqual(cValues, [1, 2, 3])
    assert.deepEqual(dValues, [1, 2, 3])
  })

  it("should act as an indentity for existing signals", function() {
    var s = sig()
    assert.strictEqual(sig(s), s)
  })

  it("should create a signal from an array of values", function() {
    sig([23])
      .call(capture, assert.deepEqual, [23])

    sig([1, 2, 3, 4])
      .call(capture, assert.deepEqual, [1, 2, 3, 4])
  })


  describe("eager signals", function() {
    it("should resume when the first target is added", function() {
      var s = sig()
      s.eager = true

      assert(s.paused)
      var t = s.then(sig())
      assert(!s.paused)

      s.pause()
      s.then(sig())
      assert(s.paused)

      t.kill()
      s.then(sig())
      assert(s.paused)
    })
  })


  describe(".then", function() {
    it("should support connecting to an existing target", function() {
      var s = sig()
      var t = sig()
      s.then(t)
      assert.deepEqual(s.targets, [t])
      assert.strictEqual(t.source, s)
    })

    it("should support creating and connecting to a new target", function() {
      var s = sig()
      var t = s.then(processor)
      assert.deepEqual(s.targets, [t])
      assert.strictEqual(t.source, s)
      assert.strictEqual(t.processor, processor)
      function processor() {}
    })

    it("should allow extra arguments to be given", function(done) {
      var s = sig()

      s.then(function(a, b, c) {
        assert.equal(a, 1)
        assert.equal(b, 2)
        assert.equal(c, 3)
        done()
      }, 2, 3)

      s.put(1)
    })
  })


  describe(".except", function(done) {
    it("should create a signal that catches errors", function(done) {
      var s = sig()
      var e = new Error(':/')

      var t = s.except(function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      })

      assert.notStrictEqual(t, s)
      s.raise(e)
    })

    it("should support extra arguments", function(done) {
      var s = sig()

      s.except(function(caughtErr, a, b) {
        assert.strictEqual(a, 1)
        assert.strictEqual(b, 2)
        done()
      }, 1, 2)

      s.raise(new Error(':/'))
    })
  })


  describe(".teardown", function() {
    it("should call the function when a signal is killed", function() {
      var s = sig()
      var run = false

      s.teardown(function() {
        run = true
        assert.strictEqual(this, s)
      })

      assert(!run)
      s.kill()
      assert(run)
    })
  })

  
  describe(".map", function() {
    it("should map the given signal", function() {
      sig([1, 2, 3, 4])
        .map(function(x) { return x * 2 })
        .map(function(x) { return x + 1 })
        .call(capture, assert.deepEqual, [3, 5, 7, 9])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return [a, b, c]
      }

      return sig([1, 2, 3, 4])
        .map(fn, 23, 32)
        .call(capture, assert.deepEqual, [
          [1, 23, 32],
          [2, 23, 32],
          [3, 23, 32],
          [4, 23, 32]
        ])
    })
  })


  describe(".filter", function() {
    it("should filter the given signal", function() {
      sig([2, 3, 4, 5, 6, 11, 12, 15, 16])
        .filter(function(x) { return x % 2 })
        .filter(function(x) { return x < 10 })
        .call(capture, assert.deepEqual, [3, 5])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return (a * b) % c
      }

      sig([1, 2, 3, 4])
        .filter(fn, 3, 2)
        .call(capture, assert.deepEqual, [1, 3])
    })

    it("should default to an identity function", function() {
      sig([1, 0, 3, null])
        .filter()
        .call(capture, assert.deepEqual, [1, 3])
    })
  })


  describe(".flatten", function() {
    it("should flatten the given signal", function() {
      sig([1, [2, [3, [4, 5, [6, 7, 8, [9, [10]]]]]]])
        .flatten()
        .call(capture, assert.deepEqual, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  })


  describe(".limit", function() {
    it("should limit the given signal", function() {
      sig([1, 2, 3, 4, 5, 6])
        .limit(3)
        .call(capture, assert.deepEqual, [1, 2, 3])
    })

    it("should kill the signal chain once the limit is reached", function() {
      var s = sig()
      s.limit(3).then(sig())

      assert(!s.disconnected)

      s.put(1)
      assert(!s.disconnected)

      s.put(2)
      assert(!s.disconnected)

      s.put(3)
      assert(s.disconnected)
    })

    it("should not output anything if the limit is 0", function() {
      sig([1, 2, 3, 4, 5, 6])
        .limit(0)
        .call(capture, assert.deepEqual, [])
    })
  })


  describe(".once", function() {
    it("should limit a signal to its first output", function() {
      sig([1, 2, 3, 4, 5, 6])
        .once()
        .call(capture, assert.deepEqual, [1])
    })

    it("should kill the signal chain after outputting a value", function() {
      var s = sig()
      s.once().then(sig())

      assert(!s.disconnected)
      s.put(23)
      assert(s.disconnected)
    })
  })


  describe(".isSig", function() {
    it("should determine whether something is a signal", function() {
      assert(!sig.isSig(void 0))
      assert(!sig.isSig(null))
      assert(!sig.isSig({}))
      assert(sig.isSig(sig()))
    })
  })


  describe(".spread", function() {
    it("should spread an array out as a function's arguments", function() {
      var results = sig.spread([1, 2, 3], function(a, b, c) {
        return [a + 1, b + 1, c + 1]
      })

      assert.deepEqual(results, [2, 3, 4])
    })
  })


  describe(".any", function() {
    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()
      var results = capture(sig.any([a, b, 23]))

      assert(!results.length)

      a.put(1)
      assert.deepEqual(results, [[1, 0]])

      b.put(2)
      assert.deepEqual(results, [[1, 0], [2, 1]])

      a.put(3)
      assert.deepEqual(results, [[1, 0], [2, 1], [3, 0]])

      b.put(4)
      assert.deepEqual(results, [[1, 0], [2, 1], [3, 0], [4, 1]])
    })
    
    it("should support objects with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.any({
        a: a,
        b: b,
        c: 23
      }))

      assert(!results.length)

      a.put(1)
      assert.deepEqual(results, [[1, 'a']])

      b.put(2)
      assert.deepEqual(results, [[1, 'a'], [2, 'b']])

      a.put(3)
      assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a']])

      b.put(4)
      assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a'], [4, 'b']])
    })

    it("should kills its listeners when the out signal is killed", function() {
      var a = sig()
      var b = sig()
      var s = sig.any([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      s.kill()
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.any([a, b])
        .except(function(e) {
          results.push(e.message)
        })

      a.raise(new Error(':/'))
      b.raise(new Error(':|'))
      a.raise(new Error('o_O'))
      b.raise(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        sig.any(arguments)
          .call(capture, assert.deepEqual, [[1, 0], [2, 1]])
      }

      test(sig.ensure(1), sig.ensure(2))
    })
  })


  describe(".all", function() {
    it("should support arrays with only non signals", function() {
      sig.all([21, 22, 23])
       .call(capture, assert.deepEqual, [[21, 22, 23]])
    })

    it("should support objects with only non signals", function() {
      sig.all({
           a: 21,
           b: 22,
           c: 23
        })
        .call(capture, assert.deepEqual, [{
            a: 21,
            b: 22,
            c: 23
        }])
    })

    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.all([a, b, 23]))
      assert(!results.length)

      a.put(1)
      assert(!results.length)

      b.put(2)
      assert.deepEqual(results, [[1, 2, 23]])

      a.put(3)
      assert.deepEqual(results, [[1, 2, 23], [3, 2, 23]])

      b.put(4)
      assert.deepEqual(results, [[1, 2, 23], [3, 2, 23], [3, 4, 23]])
    })
    
    it("should support objects with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.all({
        a: a,
        b: b,
        c: 23 
      }))

      assert(!results.length)

      a.put(1)

      assert(!results.length)

      b.put(2)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }])

      a.put(3)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }, {
        a: 3,
        b: 2,
        c: 23
      }])

      b.put(4)

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
      var results = capture(sig.all([a, 23]))

      a.put(1)
       .put(2)
       .put(3)

      assert.equal(results.length, 3)
      assert.notStrictEqual(results[0], results[1])
      assert.notStrictEqual(results[1], results[2])
      assert.notStrictEqual(results[2], results[0])
    })

    it("should output copies of a given object", function() {
      var a = sig()

      var results = capture(sig.all({
        a: a,
        b: 23
      }))

      a.put(1)
       .put(2)
       .put(3)

      assert.equal(results.length, 3)
      assert.notStrictEqual(results[0], results[1])
      assert.notStrictEqual(results[1], results[2])
      assert.notStrictEqual(results[2], results[0])
    })

    it("should kills its listeners when the out signal is killed", function() {
      var a = sig()
      var b = sig()
      var s = sig.all([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      s.kill()
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it("should work with signals with non-empty buffers", function() {
      var a = sig()
      a.put(1)

      var b = sig()
      b.put(2)

      sig.all([a, b])
        .call(capture, assert.deepEqual, [[1, 2]])
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.all([a, b])
        .except(function(e) {
          results.push(e.message)
        })

      a.raise(new Error(':/'))
      b.raise(new Error(':|'))
      a.raise(new Error('o_O'))
      b.raise(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })
  })


  describe(".merge", function() {
    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.merge([a, b, 23]))
      assert(!results.length)

      a.put(1)
      assert.deepEqual(results, [1])

      b.put(2)
      assert.deepEqual(results, [1, 2])

      a.put(3)
      assert.deepEqual(results, [1, 2, 3])

      b.put(4)
      assert.deepEqual(results, [1, 2, 3, 4])
    })
    
    it("should support objects with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.merge({
        a: a,
        b: b,
        c: 23
      }))

      assert(!results.length)

      a.put(1)
      assert.deepEqual(results, [1])

      b.put(2)
      assert.deepEqual(results, [1, 2])

      a.put(3)
      assert.deepEqual(results, [1, 2, 3])

      b.put(4)
      assert.deepEqual(results, [1, 2, 3, 4])
    })

    it("should kills its listeners when the out signal is killed", function() {
      var a = sig()
      var b = sig()
      var s = sig.merge([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      s.kill()
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.merge([a, b])
        .except(function(e) {
          results.push(e.message)
        })

      a.raise(new Error(':/'))
      b.raise(new Error(':|'))
      a.raise(new Error('o_O'))
      b.raise(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        sig.merge(arguments)
          .call(capture, assert.deepEqual, [1, 2])
      }

      test(sig.ensure(1), sig.ensure(2))
    })
  })


  describe(".update", function() {
    it("should update the signal to use the last returned signal", function() {
      var s = sig()

      var results = s
        .update(function(u) {
          return u.map(function(x) { return x * 2 })
        })
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      var u = sig()
      s.put(u)

      u.put(4)
       .put(5)
       .put(6)

      t.put(7)
       .put(8)
       .put(9)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
    })

    it("should support additional args", function() {
      var s = sig()

      var results = s
        .update(sig.map, function(x) { return x * 2 })
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [2, 4, 6])
    })

    it("should default to an identity function", function() {
      var s = sig()

      var results = s
        .update()
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should do nothing if a non-signal is returned", function() {
      var s = sig()

      var results = s
        .update(function(x) { if (x % 2) return sig.val(x) })
        .call(capture)

      s.put(1)
       .put(2)
       .put(3)
       .put(4)
       .put(5)

      assert.deepEqual(results, [1, 3, 5])
    })
  })


  describe(".appkill", function() {
    it("should appkill each returned signal", function() {
      var s = sig()

      var results = s
        .appkill(function(u) {
          return u.map(function(x) { return x * 2 })
        })
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      var u = sig()
      s.put(u)

      u.put(4)
       .put(5)
       .put(6)

      t.put(7)
       .put(8)
       .put(9)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16, 18])
    })

    it("should support additional args", function() {
      var s = sig()

      var results = s
        .appkill(sig.map, function(x) { return x * 2 })
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      var u = sig()
      s.put(u)

      u.put(4)
       .put(5)
       .put(6)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
    })

    it("should default to an identity function", function() {
      var s = sig()
      var results = capture(s.appkill())

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should do nothing if a non-signal is returned", function() {
      var s = sig()

      var results = s
        .appkill(function(x) {
          if (x % 2) return sig.val(x)
        })
        .call(capture)

      s.put(1)
       .put(2)
       .put(3)
       .put(4)
       .put(5)

      assert.deepEqual(results, [1, 3, 5])
    })
  })


  describe(".ensure", function() {
    it("should simply pass through existing signals", function() {
      sig.ensure(sig([1, 2]))
        .call(capture, assert.deepEqual, [1, 2])
    })

    it("should create a singleton signal from non-signals", function() {
      sig.ensure(23)
        .call(capture, assert.deepEqual, [23])

      sig.ensure([[1, 2], [3, 4]])
        .call(capture, assert.deepEqual, [[[1, 2], [3, 4]]])
    })
  })


  describe(".val", function() {
    it("should hold last value given to the signal", function() {
      var s = sig.val(2)
      var results = capture(s)
      assert.deepEqual(results, [2])

      s.put(3)
      assert.deepEqual(results, [2, 3])

      s.put(4)
      assert.deepEqual(results, [2, 3, 4])
    })

    it("should work for eager signals", function() {
      var s = sig.val(2)
      s.eager = true
      assert.deepEqual(s.call(capture), [2])
    })

    it("should work for non-eager signals", function() {
      var s = sig.val(2)
      s.eager = false
      s.resume()
      assert.deepEqual(s.call(capture), [2])
    })
  })


  describe(".ensureVal", function() {
    it("should turn values into sticky signals", function() {
      sig.ensureVal(23)
        .call(capture, assert.deepEqual, [23])
    })

    it("should turn signals into sticky signals", function() {
      var s = sig.ensureVal(sig([23]))
      s.call(capture, assert.deepEqual, [23])
      s.call(capture, assert.deepEqual, [23])
    })
  })

  describe(".redir", function() {
    it("should redirect signal output", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      s.redir(t)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should redirect signal errors", function(done) {
      var s = sig()
      var t = sig()
      var e = new Error(':/')

      s.redir(t)

      t.except(function(nextE) {
        assert.strictEqual(e, nextE)
        done()
      })

      s.raise(e)
    })

    it("should not redirect after the target has killed", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      s.redir(t)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])

      t.kill()

      s.put(4)
       .put(5)
       .put(6)

      assert.deepEqual(results, [1, 2, 3])
    })
  })


  describe(".to", function() {
    it("should put the given value onto the given signal", function() {
      var s = sig()
      sig.to(1, s)
      sig.to(2, s)
      sig.to(3, s)
      assert.deepEqual(capture(s), [1, 2, 3])
    })
  })


  describe(".resolve", function() {
    it("should put the given value, then kill", function() {
      var killed = false

      var s = sig()
        .teardown(function() { killed = true })
        .resolve(23)
        .call(capture, assert.deepEqual, [23])

      assert(killed)
    })
  })


  describe(".call", function() {
    it("should call a function with the signal", function(done) {
      var s = sig()
      s.call(fn, 23, 32)

      function fn(t, a, b) {
        assert.strictEqual(s, t)
        assert.equal(a, 23)
        assert.equal(b, 32)
        done()
      }
    })
  });
})
