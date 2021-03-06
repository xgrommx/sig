var sig = require('./sig'),
    assert = require('assert')


function capture(s) {
  var results = []
  s.each(function(v) { results.push(v) })
  return results
}


function sink(s, fn) {
  var results = []
  fn = sig.prime(sig.slice(arguments, 2), fn)

  return s
   .each(function(v) {
     results.push(v)
   })
   .teardown(function() {
     fn(results)
   })
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

    t1.handlers.value = function(x) {
      results1.push(x)
      this.next()
    }

    t2.handlers.value = function(x) {
      results2.push(x)
      this.next()
    }

    s.then(t1)
    s.then(t2)

    s.putEach([1, 2, 3, 4])
    assert.deepEqual(results1, [1, 2, 3, 4])
    assert.deepEqual(results2, [1, 2, 3, 4])
  })

  describe("ending", function() {
    it("should mark the signal as ended", function() {
      var s = sig()
      assert(!s.ended)
      s.end()
      assert(s.ended)
    })

    it("should clear the signal's state", function() {
      var a = sig()
      var b = a.then(function(){})
      var c = b.then(sig())

      a.put(21)
       .put(23)

      assert.strictEqual(b.source, a)
      assert.deepEqual(b.targets, [c])
      assert(b.inBuffer.length)

      b.end()
      assert.strictEqual(b.source, null)
      assert(!b.targets.length)
      assert(!b.inBuffer.length)
    })

    it("should end its targets", function() {
      var a = sig()
      var b = a.then(sig())
      var c = b.then(sig())
      var d = b.then(sig())

      assert(!a.ended)
      assert(!b.ended)
      assert(!c.ended)
      assert(!d.ended)

      a.end()
      assert(a.ended)
      assert(b.ended)
      assert(c.ended)
      assert(d.ended)
    })

    it("should disconnect the signal", function() {
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

      c.end()
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
      assert.strictEqual(c.source, null)
      assert.strictEqual(d.source, b)

      d.end()
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
      assert.strictEqual(c.source, null)
      assert.strictEqual(d.source, null)

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
      assert.strictEqual(c.source, null)
      assert.strictEqual(d.source, null)
      assert.strictEqual(e.source, b)
    })

    it("should not allow values to propagate from dead signals", function() {
      var a = sig()
      var b = sig()
      var c = sig()
      var results = capture(b)

      a.targets = [b]
      a.put(21)
      assert.deepEqual(results, [21])

      a.end()
      results = capture(c)
      a.targets = [c]
      a.put(23)
      assert(!results.length)
    })

    it("should not allow errors to propagate from dead signals", function() {
      var results
      var a = sig()
      var b = sig()
      var c = sig()

      b.handlers.error = c.handlers.error = function(e) {
        this.put(e).next()
      }

      results = capture(b)
      a.targets = [b]
      a.put(21)
      assert.deepEqual(results, [21])

      a.end()

      results = capture(c)
      a.targets = [c]
      a.put(23)
      assert(!results.length)
    })

    it("should not allow targets to be added to dead signals", function() {
      var a = sig().end()
      var b = a.then(sig())
      var c = a.then(function(){})
      assert(!a.targets.length)
      assert.strictEqual(b.source, null)
      assert.strictEqual(c.source, null)
    })
  })


  describe("error handling", function() {
    it("should support error handling", function() {
      var s = sig()
      var t = s.then(sig())
      var results = capture(t)
      var e1 = new Error(':/')
      var e2 = new Error('o_O')

      t.handlers.error = function(e) {
        this.put(e).next()
      }

      assert(!results.length)

      s.throw(e1)
      assert.equal(results.length, 1)
      assert.strictEqual(results[0], e1)

      s.throw(e2)
      assert.equal(results.length, 2)
      assert.strictEqual(results[0], e1)
      assert.strictEqual(results[1], e2)
    })

    it("should throw unhandled errors", function() {
      function thrower() {
        sig().throw(new Error('o_O'))
      }

      assert.throws(thrower, /o_O/)
    })

    it("should allow errors to propagate", function() {
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

      s2.handlers.error = function(caughtErr) {
        if (caughtErr.message != ':|') this.throw(caughtErr)
      }

      s3.handlers.error = function(caughtErr) {
        s3Err = caughtErr
      }

      s4.handlers.error = function(caughtErr) {
        s4Err = caughtErr
      }

      s1.throw(e1)
        .throw(e2)

      assert.strictEqual(s3Err, e1)
      assert.strictEqual(s4Err, e1)
    })

    it("should handle errors thrown in value handlers", function(done) {
      var s = sig()
      var t = s.then(sig())
      var u = t.then(sig())
      var e = new Error('o_O')

      t.handlers.value = function() {
        this.throw(e)
      }

      u.handlers.error = function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      }

      s.put()
    })

    it("should handle errors thrown in error handlers", function(done) {
      var s = sig()
      var t = s.then(sig())
      var u = t.then(sig())
      var e = new Error('o_O')

      t.handlers.error = function() {
        this.throw(e)
      }

      u.handlers.error = function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      }

      s.throw(new Error(':/'))
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
      var t = s.then(handler)
      assert.deepEqual(s.targets, [t])
      assert.strictEqual(t.source, s)
      assert.strictEqual(t.handlers.value, handler)
      function handler() {}
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


  describe(".catch", function(done) {
    it("should create a signal that catches errors", function(done) {
      var s = sig()
      var e = new Error(':/')

      var t = s.catch(function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      })

      assert.notStrictEqual(t, s)
      s.throw(e)
    })

    it("should support extra arguments", function(done) {
      var s = sig()

      s.catch(function(caughtErr, a, b) {
        assert.strictEqual(a, 1)
        assert.strictEqual(b, 2)
        done()
      }, 1, 2)

      s.throw(new Error(':/'))
    })
  })


  describe(".teardown", function() {
    it("should call the function when a signal is ended", function() {
      var s = sig()
      var run = false

      s.teardown(function() {
        run = true
        assert.strictEqual(this, s)
      })

      assert(!run)
      s.end()
      assert(run)
    })

    it("should get called immediately if the signal is dead", function() {
      var s = sig().end()
      var run = false

      s.teardown(function() {
        run = true
        assert.strictEqual(this, s)
      })

      assert(run)
    })
  })


  describe(".each", function() {
    it("should process each value given by the signal", function(done) {
      var s = sig()

      s.each(function(x) { this.put(x * 2) })
       .each(function(x) { this.put(x + 1) })
       .call(sink, assert.deepEqual, [3, 5, 7, 9])
       .teardown(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })

    it("should allow additional args", function(done) {
      function fn(a, b, c) {
        this.put([a, b, c])
      }

      var s = sig()

      s.each(fn, 23, 32)
       .call(sink, assert.deepEqual, [
          [1, 23, 32],
          [2, 23, 32],
          [3, 23, 32],
          [4, 23, 32]
        ])
        .teardown(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })
  })

  
  describe(".map", function() {
    it("should map the given signal", function(done) {
      var s = sig()

      s.map(function(x) { return x * 2 })
       .map(function(x) { return x + 1 })
       .call(sink, assert.deepEqual, [3, 5, 7, 9])
       .teardown(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })

    it("should allow non-function values to be given", function(done) {
      var s = sig()

      s.map(23)
       .call(sink, assert.deepEqual, [23, 23, 23, 23])
       .teardown(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })

    it("should allow additional args", function(done) {
      function fn(a, b, c) {
        return [a, b, c]
      }

      var s = sig()

      s.map(fn, 23, 32)
       .call(sink, assert.deepEqual, [
         [1, 23, 32],
         [2, 23, 32],
         [3, 23, 32],
         [4, 23, 32]
       ])
       .teardown(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })
  })


  describe(".filter", function() {
    it("should filter the given signal", function(done) {
      var s = sig()

      s.filter(function(x) { return x % 2 })
       .filter(function(x) { return x < 10 })
       .call(sink, assert.deepEqual, [3, 5])
       .teardown(done)

      s.putEach([2, 3, 4, 5, 6, 11, 12, 15, 16])
       .end()
    })

    it("should allow additional args", function(done) {
      var s = sig()

      s.filter(fn, 3, 2)
       .call(sink, assert.deepEqual, [1, 3])
       .teardown(done)

      s.putEach([1, 2, 3, 4])
       .end()

      function fn(a, b, c) {
        return (a * b) % c
      }
    })

    it("should default to an identity function", function(done) {
      var s = sig()

      s.filter()
       .call(sink, assert.deepEqual, [1, 3])
       .teardown(done)

      s.putEach([1, 0, 3, null])
       .end()
    })
  })


  describe(".flatten", function() {
    it("should flatten the given signal", function(done) {
      var s = sig()

      s.flatten()
       .limit(10)
       .call(sink, assert.deepEqual, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
       .teardown(done)

      s.putEach([1, [2, [3, [4, 5, [6, 7, 8, [9, [10]]]]]]])
       .end()
    })
  })


  describe(".limit", function() {
    it("should limit the given signal", function(done) {
      var s = sig()

      s.limit(3)
       .call(sink, assert.deepEqual, [1, 2, 3])
       .teardown(done)

      s.putEach([1, 2, 3, 4, 5, 6])
       .end()
    })

    it("should end the signal chain once the limit is reached", function() {
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

    it("should not output anything if the limit is 0", function(done) {
      var s = sig()

      s.limit(0)
       .call(sink, assert.deepEqual, [])
       .teardown(done)

      s.putEach([1, 2, 3, 4, 5, 6])
       .end()
    })
  })


  describe(".once", function() {
    it("should limit a signal to its first output", function() {
      sig([1, 2, 3, 4, 5, 6])
        .once()
        .call(capture, assert.deepEqual, [1])
    })

    it("should end the signal chain after outputting a value", function() {
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

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.any([a, b])
        .catch(function(e) {
          results.push(e.message)
          this.next()
        })

      a.throw(new Error(':/'))
      b.throw(new Error(':|'))
      a.throw(new Error('o_O'))
      b.throw(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        sig.any(arguments)
          .call(capture, assert.deepEqual, [[1, 0], [2, 1]])
      }

      test(sig.ensureVal(1), sig.ensureVal(2))
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

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.all([a, b])
        .catch(function(e) {
          results.push(e.message)
          this.next()
        })

      a.throw(new Error(':/'))
      b.throw(new Error(':|'))
      a.throw(new Error('o_O'))
      b.throw(new Error('-_-'))
      
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

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.merge([a, b])
        .catch(function(e) {
          results.push(e.message)
          this.next()
        })

      a.throw(new Error(':/'))
      b.throw(new Error(':|'))
      a.throw(new Error('o_O'))
      b.throw(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        sig.merge(arguments)
          .call(capture, assert.deepEqual, [1, 2])
      }

      test(sig.ensureVal(1), sig.ensureVal(2))
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
      t.putEach([1, 2, 3])

      var u = sig()
      s.put(u)

      u.putEach([4, 5, 6])
      t.putEach([7, 8, 9])
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


  describe(".append", function() {
    it("should append each returned signal", function() {
      var s = sig()

      var results = s
        .append(function(u) {
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
        .append(sig.map, function(x) { return x * 2 })
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
      var results = capture(s.append())

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
        .append(function(x) {
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
  })


  describe(".ensureVal", function() {
    it("should return a sticky signal if a value is given", function() {
      sig.ensureVal(23)
        .call(capture, assert.deepEqual, [23])
    })

    it("should return sticky target signal if a signal is given", function() {
      var s = sig()
      var t = sig.ensureVal(s)
      s.put(23)

      t.call(capture, assert.deepEqual, [23])
      t.call(capture, assert.deepEqual, [23])
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

      t.catch(function(nextE) {
        assert.strictEqual(e, nextE)
        done()
      })

      s.throw(e)
    })

    it("should not redirect after the target has ended", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      s.redir(t)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])

      t.end()

      s.put(4)
       .put(5)
       .put(6)

      assert.deepEqual(results, [1, 2, 3])
    })
  })


  describe(".to", function() {
    it("should put the given value onto the given signal", function() {
      var s = sig()
      var results = capture(s)
      sig.to(1, s)
      sig.to(2, s)
      sig.to(3, s)
      assert.deepEqual(results, [1, 2, 3])
    })
  })


  describe(".resolve", function() {
    it("should put the given value, then die", function() {
      var ended = false

      sig()
        .teardown(function() { ended = true })
        .resolve(23)
        .call(capture, assert.deepEqual, [23])

      assert(ended)
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
  })


  describe(".functor", function() {
    it("should simply return a function if one is given", function() {
      function foo(){}
      assert.strictEqual(sig.functor(foo), foo)
    })

    it("should wrap non-functions", function() {
      var obj = {}
      assert.strictEqual(sig.functor(obj)(), obj)
    })
  })
})
