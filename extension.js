import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const DAY_USEC = 86400 * GLib.USEC_PER_SEC;

const BAR_WIDTH = 80;
const BAR_HEIGHT = 6;
// GNOME accent blue on a semi-transparent white track; reads well on the
// default dark panel.
const BAR_FILL_COLOR = [0.208, 0.518, 0.918, 1.0];
const BAR_TRACK_COLOR = [1.0, 1.0, 1.0, 0.28];

/** Parse a YYYY-MM-DD string into a local-midnight GLib.DateTime, or null. */
function parseDate(text) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text ?? '').trim());
    if (!match)
        return null;

    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return null;

    try {
        const dt = GLib.DateTime.new_local(year, month, day, 0, 0, 0);
        if (dt.get_year() !== year || dt.get_month() !== month ||
            dt.get_day_of_month() !== day)
            return null;
        return dt;
    } catch {
        return null;
    }
}

function formatDate(dt) {
    return dt.format('%a %d %b %Y');
}

function roundedRectPath(cr, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

/**
 * All numbers the indicator needs, independent of how they are displayed.
 * `startsIn` is non-null when the first sprint has not begun yet.
 */
function computeSprintInfo(settings) {
    const startDate = parseDate(settings.get_string('start-date'));
    const lengthDays = settings.get_int('sprint-length-weeks') * 7;
    const firstNumber = settings.get_int('first-sprint-number');

    if (!startDate || lengthDays <= 0)
        return {valid: false};

    const now = GLib.DateTime.new_now_local();
    const todayMidnight = GLib.DateTime.new_local(
        now.get_year(), now.get_month(), now.get_day_of_month(), 0, 0, 0);
    // Round to whole days so DST shifts of ±1h don't affect the count.
    const diffDays = Math.round(todayMidnight.difference(startDate) / DAY_USEC);

    if (diffDays < 0) {
        return {
            valid: true,
            startsIn: -diffDays,
            number: firstNumber,
            sprintStart: startDate,
        };
    }

    const index = Math.floor(diffDays / lengthDays);
    const dayInSprint = diffDays - index * lengthDays + 1;
    const number = firstNumber + index;
    const sprintStart = startDate.add_days(index * lengthDays);
    const sprintEnd = sprintStart.add_days(lengthDays - 1);

    return {
        valid: true,
        startsIn: null,
        number,
        dayInSprint,
        lengthDays,
        sprintStart,
        sprintEnd,
        daysRemaining: lengthDays - dayInSprint,
    };
}

const SprintProgressBar = GObject.registerClass(
class SprintProgressBar extends St.DrawingArea {
    _init(params) {
        super._init({
            ...params,
            width: BAR_WIDTH,
            height: BAR_HEIGHT,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.fraction = 0.0;
        this.connect('repaint', this._onRepaint.bind(this));
    }

    _onRepaint(area) {
        const cr = area.get_context();
        try {
            const [width, height] = area.get_surface_size();

            cr.setSourceRGBA(...BAR_TRACK_COLOR);
            roundedRectPath(cr, 0, 0, width, height, height / 2);
            cr.fill();

            cr.setSourceRGBA(...BAR_FILL_COLOR);
            roundedRectPath(cr, 0, 0, width * this.fraction, height, height / 2);
            cr.fill();
        } finally {
            cr.$dispose();
        }
    }
});

const SprintIndicatorButton = GObject.registerClass(
class SprintIndicatorButton extends PanelMenu.Button {
    _init(ext) {
        super._init(0.0, 'Sprint Indicator', false);

        this._ext = ext;

        this._label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._bar = new SprintProgressBar();
        this._bar.hide();

        this._box = new St.BoxLayout({style: 'spacing: 8px;'});
        this._box.add_child(this._label);
        this._box.add_child(this._bar);
        this.add_child(this._box);

        this._rangeItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._remainingItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._rangeItem);
        this.menu.addMenuItem(this._remainingItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefsItem = new PopupMenu.PopupMenuItem('Sprint Settings…');
        prefsItem.connect('activate', () => this._ext.openPreferences());
        this.menu.addMenuItem(prefsItem);
    }

    update() {
        const settings = this._ext.getSettings();
        const mode = settings.get_string('sprint-display');
        const info = computeSprintInfo(settings);

        if (!info.valid) {
            this._label.text = 'Sprint ?';
            this._bar.hide();
            this._rangeItem.label.text = 'Set a valid start date (YYYY-MM-DD) in the settings';
            this._remainingItem.visible = false;
            return;
        }

        this._rangeItem.visible = true;

        if (info.startsIn !== null) {
            this._label.text = `Sprint ${info.number} in ${info.startsIn}d`;
            this._bar.hide();
            this._rangeItem.label.text =
                `Sprint ${info.number} starts ${formatDate(info.sprintStart)}`;
            this._remainingItem.visible = false;
            return;
        }

        this._label.text = `Sprint ${info.number}`;
        if (mode === 'day')
            this._label.text += ` · Day ${info.dayInSprint}/${info.lengthDays}`;

        this._bar.visible = mode === 'bar';
        if (mode === 'bar') {
            // Day 1 of the sprint is an empty bar, the last day is full.
            this._bar.fraction =
                (info.dayInSprint - 1) / Math.max(1, info.lengthDays - 1);
            this._bar.queue_repaint();
        }

        this._rangeItem.label.text =
            `Sprint ${info.number}: ${formatDate(info.sprintStart)} – ${formatDate(info.sprintEnd)}`;
        this._remainingItem.label.text =
            `${info.daysRemaining} ${info.daysRemaining === 1 ? 'day' : 'days'} remaining · Day ${info.dayInSprint}/${info.lengthDays}`;
        this._remainingItem.visible = true;
    }
});

export default class SprintIndicatorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._indicator = new SprintIndicatorButton(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settingsChangedId = this._settings.connect(
            'changed', () => this._indicator.update());
        this._indicator.update();
        this._scheduleMidnightRefresh();
    }

    disable() {
        this._unscheduleRefresh();

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;
    }

    _unscheduleRefresh() {
        if (this._refreshId) {
            GLib.source_remove(this._refreshId);
            this._refreshId = null;
        }
    }

    _scheduleMidnightRefresh() {
        this._unscheduleRefresh();

        const now = GLib.DateTime.new_now_local();
        const tomorrow = GLib.DateTime.new_local(
            now.get_year(), now.get_month(), now.get_day_of_month(), 0, 5, 0).add_days(1);
        const seconds = Math.max(60, Math.ceil(now.difference(tomorrow) / GLib.USEC_PER_SEC));

        this._refreshId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, seconds, () => {
                this._indicator.update();
                this._scheduleMidnightRefresh();
                return GLib.SOURCE_REMOVE;
            });
    }
}
