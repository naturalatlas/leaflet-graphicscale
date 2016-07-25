L.Control.GraphicScale = L.Control.extend({
    options: {
        position: 'bottomleft',
        updateWhenIdle: false,
        minUnitWidth: 30,
        maxUnitsWidth: 240,
        fill: false,
        units: 'metric', // "standard", "metric"
        showSubunits: false,
        doubleLine: false,
        labelPlacement: 'auto',

        // advanced: customize the subdivision
        // (format: [upperBound, [...divs], subdivision])
        divisionTable: [
            [0.5, [0, 0.25, 0.5], 0],
            [1, [0, 0.25, 0.5, 1], 0],
            [1.5, [0, 0.5, 1, 1.5], 0],
            [2, [0, 1, 2], 1],
            [3, [0, 1, 2, 3], 0],
            [5, [0, 2.5, 5], 1],
            [10, [0, 5, 10], 1],
            [20, [0, 10, 20], 5],
            [50, [0, 25, 50], 0],
            [75, [0, 75], 0],
            [100, [0, 50, 100], 0],
            [200, [0, 100, 200], 0],
            [250, [0, 250], 0],
            [500, [0, 250, 500], 0],
            [1000, [0, 500, 1000], 0],
            [2500, [0, 1000, 2500], 0],
            [5000, [0, 2500, 5000], 0],
        ]
    },

    onAdd: function (map) {
        this._map = map;

        this._scaleInner = this._buildScale();
        this._scale = this._addScale(this._scaleInner);
        this._setStyle(this.options);

        map.on(this.options.updateWhenIdle ? 'moveend' : 'move', this._update, this);
        map.whenReady(this._update, this);

        return this._scale;
    },

    onRemove: function (map) {
        map.off(this.options.updateWhenIdle ? 'moveend' : 'move', this._update, this);
    },

    _addScale: function (scaleInner) {
        var scale = L.DomUtil.create('div');
        scale.className = 'leaflet-control-graphicscale';
        scale.appendChild( scaleInner );

        return scale;
    },

    _setUnits: function (units) {
      this.options.units = units;
      this._update();
    },

    _setStyle: function (options) {
        var classNames = ['leaflet-control-graphicscale-inner'];
        if (options.fill && options.fill !== 'nofill') {
            classNames.push('filled');
            classNames.push('filled-'+options.fill);
        }

        if (options.showSubunits) {
            classNames.push('showsubunits');
        }

        if (options.doubleLine) {
            classNames.push('double');
        }

        classNames.push('labelPlacement-'+options.labelPlacement);

        this._scaleInner.className = classNames.join(' ');
    },

    _buildScale: function() {
        var root = document.createElement('div');
        root.className = 'leaflet-control-graphicscale-inner';

        var subunits = L.DomUtil.create('div', 'subunits', root);
        var units = L.DomUtil.create('div', 'units', root);

        this._units = [];
        this._unitsLbls = [];
        this._subunits = [];

        for (var i = 0; i < 5; i++) {
            var unit = this._buildDivision( i%2 === 0 );
            units.appendChild(unit);
            this._units.push(unit);

            var unitLbl = this._buildDivisionLbl();
            unit.appendChild(unitLbl);
            this._unitsLbls.push(unitLbl);

            var subunit = this._buildDivision( i%2 === 1 );
            subunits.appendChild(subunit);
            this._subunits.unshift(subunit);
        }

        this._zeroLbl = L.DomUtil.create('div', 'label zeroLabel');
        this._zeroLbl.innerHTML = '0';
        this._units[0].appendChild(this._zeroLbl);

        this._subunitsLbl = L.DomUtil.create('div', 'label subunitsLabel');
        this._subunitsLbl.innerHTML = '?';
        this._subunits[4].appendChild(this._subunitsLbl);

        return root;
    },

    _buildDivision: function(fill) {
        var item = L.DomUtil.create('div', 'division');

        var l1 = L.DomUtil.create('div', 'line');
        item.appendChild( l1 );

        var l2 = L.DomUtil.create('div', 'line2');
        item.appendChild( l2 );

        if (fill)  l1.appendChild( L.DomUtil.create('div', 'fill') );
        if (!fill) l2.appendChild( L.DomUtil.create('div', 'fill') );

        return item;
    },

    _buildDivisionLbl: function() {
        var itemLbl = L.DomUtil.create('div', 'label divisionLabel');
        return itemLbl;
    },

    _update: function () {
        var bounds = this._map.getBounds(),
            centerLat = bounds.getCenter().lat,
            //length of an half world arc at current lat
            halfWorldMeters = 6378137 * Math.PI * Math.cos(centerLat * Math.PI / 180),
            //length of this arc from map left to map right
            dist = halfWorldMeters * (bounds.getNorthEast().lng - bounds.getSouthWest().lng) / 180,
            size = this._map.getSize();

        var metersToPixels = size.x / dist; // px per meter
        if (size.x > 0) {
            var subdivisionScale;
            var scale = this._computeScale(dist, metersToPixels, this.options.maxUnitsWidth, this.options.minUnitWidth);
            if (scale && scale.subdivideValue) {
                subdivisionScale = this._computeScale(scale.subdivideValueMeters + 1, metersToPixels, +Infinity, 10);
            }
            this._render(scale, subdivisionScale);
        }
    },

    _computeScale: function(meters, metersToPixels, maxPixels, minUnitWidth) {
        var units = 'm';
        var milesInMeters = 1609.34;
        var conversionFactor = 1; // meters to target unit
        if (this.options.units === 'standard') {
            units = 'ft';
            conversionFactor = 3.28084; // ft
            if (meters >= 1 * milesInMeters) {
                conversionFactor /= 5280;
                units = 'mi';
            }
        } else {
            if (meters >= 1000) {
                conversionFactor /= 1000;
                units = 'km';
            }
        }

        // format: [upperBound, [...divs], subdivision]
        var divisionTable = this.options.divisionTable;

        var computeWithUnits = function(units, conversionFactor) {
            var value = meters * conversionFactor;
            // find one that yields minimum width, above min width
            for (var i = 0, n = divisionTable.length; i < n; i++) {
                var minPixels = divisionTable[i][1].length * minUnitWidth;
                var targetValue = divisionTable[i][0];
                if (targetValue > value) break;
                var targetMeters = targetValue / conversionFactor;
                var widthPx = targetMeters * metersToPixels;
                if (widthPx < minPixels) continue;
                if (widthPx > maxPixels) break;

                return {
                    preset: i,
                    units: units, // m, km, ft, mi
                    pixels: widthPx,
                    meters: targetMeters, // width in meters
                    metersToPixels: metersToPixels, // conversion factor
                    unitsToMeters: 1 / conversionFactor,
                    divs: divisionTable[i][1],
                    subdivideValue: divisionTable[i][2],
                    subdivideValueMeters: divisionTable[i][2] / conversionFactor
                };
            }
            return null;
        };

        var result = computeWithUnits(units, conversionFactor);
        if (result) return result;

        // rare: if we fail to find a good value, convert back to the base unit and try again
        if (units === 'mi') return computeWithUnits('ft', conversionFactor * 5280);
        if (units === 'km') return computeWithUnits('m', conversionFactor * 1000);

        return null;
    },

    _render: function(scale, subdivisionScale) {
        if (!scale) { this._scale.style.display = 'none'; return; }
        this._scale.style.display = 'block';
        this._renderUnits(scale, this._units, this._unitsLbls);
        this._renderUnits(subdivisionScale, this._subunits, null);
        this._subunitsLbl.innerHTML = subdivisionScale ? subdivisionScale.divs[subdivisionScale.divs.length - 1] + subdivisionScale.units : '';
    },

    _renderUnits: function(scale, elements, labelElements) {
        var i, n, j;
        var elementCount = elements.length;

        if (scale) {
            // render active divisions
            var accumulatedWidth = 0;
            for (i = 1, n = scale.divs.length; i < n; i++) {
                var last = i === n - 1;
                var j = i - 1; // dom index
                var label = scale.divs[i] + (last ? scale.units : '');

                // note: the bar distribution is not always uniform
                var targetWidth = scale.divs[i] * scale.unitsToMeters * scale.metersToPixels;
                var width = targetWidth - accumulatedWidth;
                accumulatedWidth += width;

                elements[j].className = 'division';
                elements[j].style.width = width + 'px';
                if (labelElements) {
                    labelElements[j].className = 'label divisionLabel ' + (last ? 'labelLast' : 'labelSub');
                    labelElements[j].innerHTML = label;
                }
            }
        }

        // hide trailing divisions no longer needed
        var activeCount = scale ? Math.max(0, scale.divs.length - 1) : 0;
        for (i = activeCount, n = this._units.length; i < n; i++) {
            elements[i].style.width = 0;
            elements[i].className = 'division hidden';
        }
    }

});

L.Map.mergeOptions({
    graphicScaleControl: false
});


L.Map.addInitHook(function () {
    if (this.options.graphicScaleControl) {
        this.graphicScaleControl = new L.Control.GraphicScale();
        this.addControl(this.graphicScaleControl);
    }
});

L.control.graphicScale = function (options) {
    return new L.Control.GraphicScale(options);
};
