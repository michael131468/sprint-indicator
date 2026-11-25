import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function isValidDate(text) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text ?? '').trim());
    if (!match)
        return false;

    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (year < 1970 || year > 2999 || month < 1 || month > 12 || day < 1 || day > 31)
        return false;

    try {
        const dt = GLib.DateTime.new_local(year, month, day, 0, 0, 0);
        return dt.get_year() === year && dt.get_month() === month &&
            dt.get_day_of_month() === day;
    } catch {
        return false;
    }
}

export default class SprintIndicatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Sprint',
            icon_name: 'system-run-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: 'Sprint Schedule',
            description: 'Sprints are counted in fixed blocks starting from the given date.',
        });

        const dateRow = new Adw.EntryRow({
            title: 'Start date of first sprint (YYYY-MM-DD)',
            text: settings.get_string('start-date'),
        });
        dateRow.connect('changed', () => {
            // Only commit when the entered date is valid.
            if (isValidDate(dateRow.text))
                settings.set_string('start-date', dateRow.text.trim());
        });
        group.add(dateRow);

        const lengthRow = new Adw.SpinRow({
            title: 'Sprint length (weeks)',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 8,
                step_increment: 1,
                value: settings.get_int('sprint-length-weeks'),
            }),
        });
        lengthRow.connect('changed', () =>
            settings.set_int('sprint-length-weeks', lengthRow.value));
        group.add(lengthRow);

        const numberRow = new Adw.SpinRow({
            title: 'Sprint number at start date',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 9999,
                step_increment: 1,
                value: settings.get_int('first-sprint-number'),
            }),
        });
        numberRow.connect('changed', () =>
            settings.set_int('first-sprint-number', numberRow.value));
        group.add(numberRow);

        const DISPLAY_VALUES = ['day', 'bar', 'none'];
        const displayRow = new Adw.ComboRow({
            title: 'Top bar display',
            subtitle: 'What to show next to the sprint number',
            model: new Gtk.StringList({
                strings: [
                    'Day counter (Day 3/14)',
                    'Progress bar',
                    'Sprint number only',
                ],
            }),
        });
        displayRow.selected = Math.max(0,
            DISPLAY_VALUES.indexOf(settings.get_string('sprint-display')));
        displayRow.connect('notify::selected', () =>
            settings.set_string('sprint-display', DISPLAY_VALUES[displayRow.selected]));
        group.add(displayRow);

        page.add(group);
        window.add(page);
    }
}
