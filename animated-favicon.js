(function () {
  document.addEventListener('DOMContentLoaded', function () {
    // Remove all existing favicon links so nothing competes with us
    var existing = document.querySelectorAll("link[rel*='icon']");
    for (var i = 0; i < existing.length; i++) {
      existing[i].parentNode.removeChild(existing[i]);
    }

    // Create a single favicon link we fully control
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.appendChild(link);

    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    var ctx = canvas.getContext('2d');

    // Fallback img loop (Firefox / file:// protocol)
    var useImgLoop = true;
    var img = document.createElement('img');
    img.src = 'animated-favicon.gif';
    img.style.cssText = 'position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
    document.body.appendChild(img);
    img.addEventListener('load', function () {
      (function frame() {
        if (!useImgLoop) return;
        ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(img, 0, 0, 32, 32);
        link.href = canvas.toDataURL('image/png');
        requestAnimationFrame(frame);
      })();
    });

    if (typeof ImageDecoder === 'undefined') return;

    fetch('animated-favicon.gif')
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buffer) {
        var stream = new ReadableStream({
          start: function (c) { c.enqueue(new Uint8Array(buffer)); c.close(); }
        });
        var decoder = new ImageDecoder({ data: stream, type: 'image/gif' });
        return decoder.tracks.ready.then(function () {
          var frameCount = decoder.tracks.selectedTrack.frameCount;
          useImgLoop = false;
          var frameIndex = 0;

          function renderFrame() {
            decoder.decode({ frameIndex: frameIndex }).then(function (result) {
              var frame = result.image;
              var delay = Math.max(16, Math.min((frame.duration != null ? frame.duration / 1000 : 100) / 2, 150));
              canvas.width = frame.displayWidth;
              canvas.height = frame.displayHeight;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(frame, 0, 0);
              link.href = canvas.toDataURL('image/png');
              frame.close();
              frameIndex = (frameIndex + 1) % frameCount;
              setTimeout(renderFrame, delay);
            }).catch(function () { setTimeout(renderFrame, 100); }); // retry on error
          }

          renderFrame();
        });
      })
      .catch(function () {});
  });
})();
