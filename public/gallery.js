(function () {
  var currentGallery = null;
  var currentImages = [];
  var currentIndex = 0;

  var landing = document.getElementById("landing");
  var header = document.getElementById("site-header");
  var galleryView = document.getElementById("gallery-view");
  var grid = document.getElementById("gallery-grid");
  var title = document.getElementById("gallery-title");
  var desc = document.getElementById("gallery-description");
  var count = document.getElementById("gallery-count");
  var filmAlbums = document.getElementById("film-albums");
  var albumList = document.getElementById("album-list");

  var lightbox = document.getElementById("lightbox");
  var lbImage = document.getElementById("lb-image");
  var lbTitle = document.getElementById("lb-title");
  var lbCaption = document.getElementById("lb-caption");
  var lbCounter = document.getElementById("lb-counter");

  function enterSite() {
    landing.classList.add("fade-to-black");
    header.classList.remove("hidden");
    galleryView.classList.remove("hidden");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        galleryView.classList.add("visible");
      });
    });
    setTimeout(function () {
      landing.classList.add("hidden");
    }, 1000);
    loadGallery("Selection");
  }

  document.getElementById("enter-btn").addEventListener("click", function (e) {
    e.preventDefault();
    enterSite();
  });

  function pseudoRandom(seed) {
    var x = Math.sin(seed * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }

  function layoutPhotos() {
    var cards = grid.querySelectorAll(".photo-card");
    if (!cards.length) return;

    var viewW = grid.clientWidth;
    var margin = 60;
    var y = margin;
    var rowHeight = 0;
    var x = margin;
    var rowCards = [];

    cards.forEach(function (card, i) {
      var img = card.querySelector("img");
      var natW = img.naturalWidth || 400;
      var natH = img.naturalHeight || 300;

      var scale = (viewW * 0.3 + pseudoRandom(i * 7) * viewW * 0.2) / natW;
      scale = Math.max(0.15, Math.min(scale, 0.6));

      var dispW = natW * scale;
      var dispH = natH * scale;

      if (x + dispW + margin > viewW && rowCards.length > 0) {
        var totalW = 0;
        rowCards.forEach(function (rc) { totalW += rc.w; });
        var extraSpace = viewW - totalW - margin * (rowCards.length + 1);
        var spacing = extraSpace / (rowCards.length + 1);
        var cx = margin;
        rowCards.forEach(function (rc) {
          cx += spacing;
          rc.el.style.left = cx + "px";
          rc.el.style.top = y + "px";
          cx += rc.w;
        });
        y += rowHeight + 40 + pseudoRandom(i * 13) * 60;
        rowHeight = 0;
        x = margin;
        rowCards = [];
      }

      card.style.width = dispW + "px";
      card.style.height = dispH + "px";
      img.style.width = dispW + "px";
      img.style.height = dispH + "px";

      var rotation = (pseudoRandom(i * 17) - 0.5) * 6;
      card.style.transform = "rotate(" + rotation + "deg)";

      rowCards.push({ el: card, w: dispW, h: dispH });
      rowHeight = Math.max(rowHeight, dispH);
      x += dispW + margin;
    });

    if (rowCards.length > 0) {
      var totalW2 = 0;
      rowCards.forEach(function (rc) { totalW2 += rc.w; });
      var extraSpace2 = viewW - totalW2 - margin * (rowCards.length + 1);
      var spacing2 = extraSpace2 / (rowCards.length + 1);
      var cx2 = margin;
      rowCards.forEach(function (rc) {
        cx2 += spacing2;
        rc.el.style.left = cx2 + "px";
        rc.el.style.top = y + "px";
        cx2 += rc.w;
      });
      y += rowHeight + margin;
    }

    grid.style.height = (y + margin) + "px";
  }

  function renderImages(images) {
    grid.innerHTML = "";
    var loaded = 0;
    var total = images.length;

    images.forEach(function (img, i) {
      var card = document.createElement("div");
      card.className = "photo-card";

      var imgEl = document.createElement("img");
      imgEl.loading = "lazy";
      imgEl.alt = img.title || "";
      imgEl.src = img.largeUrl || img.mediumUrl || img.archivedUri;

      imgEl.onload = function () {
        imgEl.classList.add("loaded");
        loaded++;
        if (loaded === total || loaded % 5 === 0) {
          layoutPhotos();
        }
      };

      var overlay = document.createElement("div");
      overlay.className = "item-overlay";
      if (img.title) {
        overlay.innerHTML = '<span class="item-title">' + img.title + "</span>";
      }

      card.appendChild(imgEl);
      card.appendChild(overlay);
      card.addEventListener("click", function () {
        openLightbox(i);
      });

      grid.appendChild(card);
    });
  }

  function loadGallery(key) {
    if (key === "User-Uploads") {
      loadUserUploads();
      return;
    }

    var gallery = GALLERIES[key];
    if (!gallery) return;

    currentGallery = key;
    currentImages = gallery.images;

    document.querySelectorAll(".nav-link").forEach(function (el) {
      el.classList.toggle("active", el.dataset.gallery === key);
    });

    title.textContent = gallery.title;
    desc.textContent = gallery.description || "";
    count.textContent = gallery.totalImages + " images";

    if (key === "All-New-Film" && gallery.albums) {
      filmAlbums.classList.remove("hidden");
      albumList.innerHTML = "";
      gallery.albums.forEach(function (album) {
        var card = document.createElement("div");
        card.className = "album-card";
        card.innerHTML =
          '<div class="album-name">' + album.albumName + "</div>" +
          '<div class="album-count">' + album.totalImages + " images</div>";
        card.addEventListener("click", function () {
          loadAlbumImages(album.albumKey, album.albumName);
        });
        albumList.appendChild(card);
      });
    } else {
      filmAlbums.classList.add("hidden");
    }

    renderImages(currentImages);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  var uploadsView = document.getElementById("uploads-view");
  var uploadsImage = document.getElementById("uploads-image");
  var uploadsTitle = document.getElementById("uploads-title");
  var uploadsCounter = document.getElementById("uploads-counter");
  var uploadsBack = document.getElementById("uploads-back");
  var uploadsImages = [];
  var uploadsIndex = 0;
  var uploadsTransitioning = false;

  function showUploadsImage(index) {
    if (index < 0 || index >= uploadsImages.length) return;
    uploadsIndex = index;
    var img = uploadsImages[index];
    uploadsTitle.textContent = img.title || "";
    uploadsCounter.textContent = (index + 1) + " / " + uploadsImages.length;

    uploadsImage.classList.add("zoom-fade");
    uploadsTransitioning = true;

    setTimeout(function () {
      uploadsImage.src = img.largeUrl || img.mediumUrl || img.archivedUri;
      if (uploadsImage.complete) {
        uploadsImage.classList.remove("zoom-fade");
        uploadsTransitioning = false;
      }
      uploadsImage.onload = function () {
        uploadsImage.classList.remove("zoom-fade");
        uploadsTransitioning = false;
      };
    }, 400);
  }

  function openUploadsView(images) {
    uploadsImages = images;
    uploadsIndex = 0;
    header.classList.add("hidden");
    galleryView.classList.add("hidden");
    uploadsView.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    showUploadsImage(0);
  }

  function closeUploadsView() {
    uploadsView.classList.add("hidden");
    uploadsImage.src = "";
    header.classList.remove("hidden");
    galleryView.classList.remove("hidden");
    galleryView.classList.add("visible");
    document.body.style.overflow = "";
  }

  uploadsView.addEventListener("click", function (e) {
    if (e.target === uploadsBack || uploadsBack.contains(e.target)) return;
    if (uploadsTransitioning) return;
    if (uploadsImages.length <= 1) return;
    var next = (uploadsIndex + 1) % uploadsImages.length;
    showUploadsImage(next);
  });

  uploadsBack.addEventListener("click", function (e) {
    e.stopPropagation();
    closeUploadsView();
  });

  document.addEventListener("keydown", function (e) {
    if (uploadsView.classList.contains("hidden")) return;
    if (e.key === "Escape") closeUploadsView();
    if (e.key === "ArrowRight" && !uploadsTransitioning) {
      var next = (uploadsIndex + 1) % uploadsImages.length;
      showUploadsImage(next);
    }
    if (e.key === "ArrowLeft" && !uploadsTransitioning) {
      var prev = uploadsIndex - 1;
      if (prev < 0) prev = uploadsImages.length - 1;
      showUploadsImage(prev);
    }
  });

  function loadUserUploads() {
    currentGallery = "User-Uploads";
    filmAlbums.classList.add("hidden");

    document.querySelectorAll(".nav-link").forEach(function (el) {
      el.classList.toggle("active", el.dataset.gallery === "User-Uploads");
    });

    fetch("/api/uploads")
      .then(function (r) { return r.json(); })
      .then(function (images) {
        if (images.length === 0) {
          title.textContent = "USER UPLOADS";
          desc.textContent = "No uploads yet";
          count.textContent = "";
          renderImages([]);
          return;
        }
        openUploadsView(images);
      })
      .catch(function () {
        title.textContent = "USER UPLOADS";
        desc.textContent = "Failed to load uploads";
        count.textContent = "";
      });
  }

  function loadAlbumImages(albumKey, albumName) {
    var API_KEY = "W0g9oqdOrzuhEpIQ2qaTXimrzsfryKSZ";
    var url =
      "https://alecsavoyephotography.smugmug.com/api/v2/album/" +
      albumKey +
      "!images?APIKey=" +
      API_KEY +
      "&count=500";

    title.textContent = albumName;
    desc.textContent = "Loading...";
    count.textContent = "";
    grid.innerHTML = "";
    filmAlbums.classList.add("hidden");

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var images = (data.Response && data.Response.AlbumImage) || [];
        currentImages = images.map(function (img) {
          var largest = img.ArchivedUri || "";
          return {
            title: img.Title || "",
            caption: img.Caption || "",
            thumbnailUrl: img.ThumbnailUrl || "",
            mediumUrl: img.MediumUrl || largest,
            largeUrl: img.LargeUrl || largest,
            archivedUri: img.ArchivedUri || largest,
            imageKey: img.ImageKey || "",
            webUri: img.WebUri || ""
          };
        });

        desc.textContent = "";
        count.textContent = currentImages.length + " images";
        renderImages(currentImages);
      })
      .catch(function () {
        desc.textContent = "Failed to load album";
      });
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutPhotos, 200);
  });

  function openLightbox(index) {
    currentIndex = index;
    updateLightbox();
    lightbox.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.classList.add("hidden");
    document.body.style.overflow = "";
    lbImage.src = "";
  }

  function updateLightbox() {
    var img = currentImages[currentIndex];
    if (!img) return;
    lbImage.src = img.largeUrl || img.mediumUrl || img.archivedUri;
    lbTitle.textContent = img.title || "";
    lbCaption.textContent = img.caption || "";
    lbCounter.textContent = currentIndex + 1 + " / " + currentImages.length;
  }

  function nextImage() {
    if (currentIndex < currentImages.length - 1) {
      currentIndex++;
      updateLightbox();
    }
  }

  function prevImage() {
    if (currentIndex > 0) {
      currentIndex--;
      updateLightbox();
    }
  }

  document.getElementById("lb-close").addEventListener("click", closeLightbox);
  document.getElementById("lb-next").addEventListener("click", nextImage);
  document.getElementById("lb-prev").addEventListener("click", prevImage);

  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", function (e) {
    if (lightbox.classList.contains("hidden")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowRight") nextImage();
    if (e.key === "ArrowLeft") prevImage();
  });

  document.querySelectorAll(".nav-link").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      loadGallery(el.dataset.gallery);
    });
  });

  document.getElementById("logo").addEventListener("click", function (e) {
    e.preventDefault();
    loadGallery("Selection");
  });
})();
