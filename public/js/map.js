(function () {
    
    var map, balance, searchSlider;
    var isSearching = false;

    $(document).ready(function () {
        map = new Map('map', function() {
            $("#wager-slider").bind("change", function(e) {
                var value = e.target.value;
                map._updateRadius(value);
            }).trigger("change"); // trigger once to load value

            searchSlider = new SearchSlider('#search-slider', '#search-drop', '.search-area');
            $(window).mousewheel(function(e) {
                if (isSearching) return;
                var wager_slider = $("#wager-slider");
                wager_slider.val(parseInt(wager_slider.val()) + e.deltaY * 10).trigger('change'); // TODO: more efficent selector
            });
            balance = new Balance(window.startingBalance, '#balance_num');
        });
        var searchSlider = new SearchSlider('#search-slider', '#search-drop', '.search-area');
        balance = new Balance(startingBalance, '#balance_num');

        navigator.geolocation.getCurrentPosition(gpsPermissionGranted, function(err) {console.log(err)}, {enableHighAccuracy: true});
    });

    function gpsPermissionGranted(position) {
        $('#gpsApproval h1').html('<i class="fa fa-thumbs-o-up"></i>');
        $('#gpsApproval').addClass('approved');
        setTimeout(function () {
            $('#gpsApproval').css('zIndex', '-1')
        }, 1200);
        console.log(position.coords.latitude + ', ' + position.coords.longitude);

        map.init(position);
    }

    var API = function() {};
    API.cache = function(amount, callback) {
        var position = map.getPosition();
        $.post('/api/cache', {
            amount: amount,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        }, function(data) {
            balance.subtract(amount);
            if (callback) callback(data);
        });
    };

    var SearchSlider = function(slider, drop, area) {
        var that = this;

        this.$slider = $(slider);
        this.$drop = $(drop);
        this.$area = $(area);
        this.isDropped = false;

        this.$slider.draggable({
            containment: '.search-area',
            axis: 'x',
            revert: 'invalid',
            drag: function (event, ui) {
                that.$area.css("color", "rgba(255,255,255, " + (( that.$area.width() - that.$slider.position().left) / that.$area.width() - 0.4) + ")");
            },
            stop: function (event, ui) {
                that.$area.css("color", "rgba(255,255,255, " + (( that.$area.width() - that.$slider.position().left) / that.$area.width()) + ")");
            }
        });

        this.$drop.droppable({
            accept: slider,
            drop: function (event, ui) {
                isSearching = true;
                that.isDropped = true;
                that.$slider.draggable("disable").animate({
                    "right": "0px",
                    "left": that.$area.width() - that.$slider.width() }, 200);
                that.$area.css("color", "rgba(255,255,255, 0)");

                var amount = $("#wager-slider").val();
                //PUT STUFF HERE FOR WHEN USER SUCCESSFULLY SEARCHES
                if (!balance.check(amount)) {
                    isSearching = false;
                    notify('Insufficient Doge', 'Please deposit more dogecoin.');
                    that.enable();
                } else {
                    $('.map_circle_radar').css({opacity: 1});
                    $('.map_circle_inner_wrap').css({opacity: 0});
                    setTimeout(function() {
                        API.cache(amount, function(caches) {
                            console.log(caches);
                            map.showCaches(caches, function() {
                                isSearching = false;
                                $('.map_circle_radar').css({opacity: 0});
                                $('.map_circle_inner_wrap').css({opacity: 1});
                                var gain = 0;
                                caches.forEach(function(elem) {
                                    gain += elem.amount;
                                });

                                notify("Search Complete!", "After wagering " + amount + " dogecoin, you found " + gain + " dogecoin!  You now have " + balance.getBalance() + " dogecoin.");
                                that.enable()
                            });
                        });
                    }, 1500);
                }
            }
        });

        $(window).on("throttledresize", that._onResize.bind(this));
    };
    SearchSlider.prototype.enable = function() {
        this.isDropped = false;
        this.$slider.draggable("enable").animate({"left": 0}, 500);
        this.$area.animate({"color": "rgba(255,255,255, 1)"}, 500);
    };
    SearchSlider.prototype._onResize = function(e) {
        if (this.isDropped) {
            this.$slider.css({"left": this.$area.width() - this.$slider.width()});
        }
    };

    var Map = function (id, callback) {
        console.log('Map created');
        this.id = id;
        var that = this;
        this.$container = $("#" + id);
        this._onLoadCallback = callback;
    };
    Map.prototype.init = function (position) {
        var that = this;
        console.log('Map initialized');
        this.center = position;
        var mapOptions = {
            // hide control elements
            disableDefaultUI: true,

            // prevent manual zoom
            zoomControl: false,
            scaleControl: false,
            scrollwheel: false,
            disableDoubleClickZoom: true,

            // prevent panning
            draggable: false,

            // starting position
            center: that._positionToLatLng(position),
            zoom: 1
        };
        this.gmap = new google.maps.Map(this.$container.find('.map_gmap').get()[0], mapOptions);
        google.maps.event.trigger(this.gmap, 'resize'); // https://stackoverflow.com/questions/3437907/google-maps-api-resizing-generates-blank-white-space
        this._updateRadius(10);
        navigator.geolocation.watchPosition(function(position) {
            that._updateCenter(position);
            that._updateRadius(that.radius);
        }, function(err) {console.log(err)}, {
            enableHighAccuracy: true
        });

        $(window).on("throttledresize", function( event ) {
            that._onResize();
        });

        if (this._onLoadCallback) this._onLoadCallback();
    };
    Map.prototype._updateCenter = function(center, animate) {
        this.center = center;
        if (!animate) {
            this.gmap.setCenter(this._positionToLatLng(center));
        } else {
            this.gmap.panTo(this._positionToLatLng(center));
        }
    };
    Map.prototype._updateRadius = function(radius) {
        this.radius = radius;

        // angle: http://www.movable-type.co.uk/scripts/latlong.html
        // "Destination point given distance and bearing from start point"
        var lat1 = this.center.coords.latitude * Math.PI / 180;
        var lon1 = this.center.coords.longitude * Math.PI / 180;
        var brng = Math.PI/2;
        var d = radius/1000;
        var R = 6371; // km
        var lat2 = Math.asin( Math.sin(lat1)*Math.cos(d/R) +
            Math.cos(lat1)*Math.sin(d/R)*Math.cos(brng) );
        var lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(d/R)*Math.cos(lat1),
                Math.cos(d/R)-Math.sin(lat1)*Math.sin(lat2));
        lat2 *= 180 / Math.PI;
        lon2 *= 180 / Math.PI;

        // Figure out what zoom level should be used
        // https://stackoverflow.com/questions/6048975/google-maps-v3-how-to-calculate-the-zoom-level-for-a-given-bounds
        var GLOBE_WIDTH = 256; // a constant in Google's map projection
        var angle = 2*(lon2-this.center.coords.longitude);
        if (angle < 0) {
            angle += 360;
        }
        var pixelWidth = Math.min(this.$container.width(), this.$container.height());
        var zoom = Math.floor(Math.log(pixelWidth * 360 / angle / GLOBE_WIDTH) / Math.LN2);

        this.gmap.setZoom(zoom); // if zoom level is past limit, Google Maps will zoom to limit

        // Calculate field of view angle
        var fov = (pixelWidth * 360) / (Math.pow(2, this.gmap.getZoom()) * GLOBE_WIDTH); // use getZoom() method in case map has been zoomed past limit
//        console.log(zoom, fov);

        function distance(lat1, lon1, lat2, lon2) {
            var R = 6371; // km
            var dLat = (lat2-lat1) * Math.PI / 180;
            var dLon = (lon2-lon1) * Math.PI / 180;
            lat1 = lat1 * Math.PI / 180;
            lat2 = lat2 * Math.PI / 180;

            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return d = R * c * 1000;
        }

        var displayRadius = distance(this.center.coords.latitude, this.center.coords.longitude - fov/2, this.center.coords.latitude, this.center.coords.longitude + fov/2) / 2;

        var circleRadius = radius / displayRadius * pixelWidth;

        $('.map_circle').css({
            width: circleRadius + "px",
            height: circleRadius + "px",
            "margin-top": -circleRadius/2 + "px",
            "margin-left": -circleRadius/2 + "px"
        })
    };
    Map.prototype._onResize = function() {
        // immediately recenter the map
        this._updateCenter(this.center, false);
        this._updateRadius(this.radius);
    };
    Map.prototype._positionToLatLng = function(position) {
        return new google.maps.LatLng(position.coords.latitude, position.coords.longitude)
    };
    Map.prototype.getPosition = function() {
        return this.center;
    };
    Map.prototype.showCaches = function(caches, callback) {
        var that = this;
        async.map(caches, function(cache, done) {
            setTimeout(function() {
                var marker = new google.maps.Marker({
                    position: new google.maps.LatLng(cache.loc[1], cache.loc[0]),
                    animation: google.maps.Animation.DROP,
                    map: that.gmap
                });
                done(null, marker);
            }, Math.random() * 1000);
        }, function(err, markers) {
            console.log(markers);
            async.each(markers, function(marker, done) {
                setTimeout(function() {
                    marker.setMap(null);
                    done();
                }, (1.5 + Math.random()*1.5) * 1000);
            }, callback);
        });
    };
    Map.prototype.zoomDelta = function(n) {
        this._updateRadius(this.radius + n);
    };

    var Balance = function(startingBalance, selector) {
        this.$elem = $(selector);
        this.balance = startingBalance;
        this._update();
    };
    Balance.prototype._update = function() {
        this.$elem.text(this.balance);
    };
    Balance.prototype.getBalance = function() {
        return this.balance;
    };
    Balance.prototype.add = function(amount) {
        this.balance += amount;
        this._update();
    }
    Balance.prototype.subtract = function(amount) {
        this.balance -= amount;
        this._update();
    };
    Balance.prototype.check = function(amount) {
        return amount <= this.balance;
    };
})();