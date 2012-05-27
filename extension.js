const St = imports.gi.St;
const Main = imports.ui.main;
const Search = imports.ui.search;
const SearchDisplay = imports.ui.searchDisplay;
const IconGrid = imports.ui.iconGrid;
const GLib = imports.gi.GLib;
const Soup = imports.gi.Soup;

const MAX_SEARCH_RESULTS_ROWS = 1;
const ICON_SIZE = 81;

const HOUR = 3600 * 1000000;

let currencyProvider = "";

function CalcResult(result) {
    this._init(result);
}

CalcResult.prototype = {
    _init: function(resultMeta) {

        this.actor = new St.Bin({ style_class: 'contact',
                                  reactive: true,
                                  track_hover: true });

        let outer = new St.BoxLayout({ style_class: 'contact-content',
										vertical: true});

        let content = new St.BoxLayout( { vertical: false });
        this.actor.set_child(outer);

		outer.add(content, {x_fill: true, y_fill: false})

        let icon = new St.Icon({ icon_type: St.IconType.FULLCOLOR,
                                 icon_size: ICON_SIZE,
                                 icon_name: 'accessories-calculator',
                                 style_class: 'contact-icon' });

        content.add(icon, { x_fill: true,
                            y_fill: false,
                            x_align: St.Align.START,
                            y_align: St.Align.MIDDLE });

        let result = new St.BoxLayout({ style_class: 'contact-details',
                                        vertical: true });

        content.add(result, { x_fill: true, x_align: St.Align.START });

        let exprLabel = new St.Label({ text: resultMeta.expr,
                                         style_class: 'result-expression' });
        let resultLabel = new St.Label({ text: resultMeta.result,
                                         style_class: 'result-result' });

		// Terms of use for timegenie.com feed say we can use it as long as we thank them
        let thanksLabel = new St.Label({ text: "Rates Courtesy Of TimeGenie.com",
										 style_class: 'thanks' });

        result.add(exprLabel, { x_fill: false, x_align: St.Align.START });
        result.add(resultLabel, { x_fill: false, x_align: St.Align.START });
        outer.add(thanksLabel, { x_fill: false, x_align: St.Align.MIDDLE });

    }

};

function CurrencyProvider() {
    this._init.apply(this, arguments);
}

CurrencyProvider.prototype = {
    __proto__: Search.SearchProvider.prototype,

    _init: function(title) {
        Search.SearchProvider.prototype._init.call(this, title);
    },

	/**
	 * Session for making HTTP requests
	 **/
    _session: new Soup.SessionSync(),

	/**
	 * Last time we got new currency values
	 **/
    _lastUpdate: GLib.DateTime.new_from_unix_local(0),

	/**
	 * Regex to pull out currency exchange rates without needing an XML parser
	 **/
    _parseRx: /currency code="([^"]*)" description="([^"]*)" rate="([^"]*)"/,

	/**
	 * Dictionary of exchange rates
	 **/
    _rates: {},

	/**
	 * Test to see if search line matches a possible currency conversion.
	 **/
    _currencyRx: /^([0-9]+\.?[0-9]*)\s*([a-z]{3})\s*to\s*([a-z]{3})$/i,

	/**
	 * Function to determine if the search terms are something that can be
	 * interpreted as a currency conversion. This includes the two currency
	 * ids being in the list of currency conversion rates we currently have
	 *
	 * Also attempts to update rates if they are out of date
	 **/
    _isCurrencyConversion: function(term) {
		let result = {};
		let valid = false;
		let match = this._currencyRx.exec(term);
		if(match != null && match.length === 4) {
			if(this._ratesOutOfDate()) {
				this._updateRates();
			}
			let from_currency = match[2].toUpperCase();
			let to_currency = match[3].toUpperCase();
			valid = (this._rates[from_currency] != null) && (this._rates[to_currency] != null);
			result = {
						valid : valid,
						amt   : match[1],
						from  : from_currency,
						to    : to_currency
					 }
		} else {
			result = { valid : false };
		}
		return result;
	},

	/**
	 * Checks if conversion rates are out of date.
	 *
	 * Currently we consider rates out of date if they are more than 12 hours old.
	 **/
	_ratesOutOfDate: function() {
		let now = GLib.DateTime.new_now_local();
		return (now.difference(this._lastUpdate) > 12 * HOUR);
	},

	/**
	 * Update rates via timegenie.com exchange rate feed
	 **/
	_updateRates: function() {
		let msg = Soup.Message.new("GET", "http://rss.timegenie.com/forex2.xml");
		this._session.send_message(msg);
		if(msg.status_code === 200) {
			let lines = msg.response_body.data.split("\n");
			for(let i = 0; i < lines.length; i++) {
				let line = lines[i];
				let match = this._parseRx.exec(line);
				if(match != null && match.length === 4) {
					this._rates[match[1]] = match[3];
				}
			}
			this._lastUpdate = GLib.DateTime.new_now_local();
		}
	},

    getInitialResultSet: function(terms) {
        let term = terms.join("");
        let result = this._isCurrencyConversion(term);
        if(result.valid) {
			let expr = [result.amt, result.from, "to", result.to].join(" ");
			let conversion = result.amt * this._rates[result.to] / this._rates[result.from];

			return [{ 	'expr'  : expr, 'result': conversion.toFixed(2) + "" }];
        }

        return [];
    },

    getSubsearchResultSet: function(prevResults, terms) {
        return this.getInitialResultSet(terms);
    },

    getResultMetas: function(result) {
		let metas = [];
		for(let i = 0; i < result.length; i++) {
			metas.push({'id' : i, 'result' : result[i].result, 'expr' : result[i].expr});
		}
        return metas;
    },

    createResultActor: function(resultMeta, terms) {
        let result = new CalcResult(resultMeta);
        return result.actor;
    },

    createResultContainerActor: function() {
        let grid = new IconGrid.IconGrid({ rowLimit: MAX_SEARCH_RESULTS_ROWS,
                                           xAlign: St.Align.START });
        grid.actor.style_class = 'contact-grid';

        let actor = new SearchDisplay.GridSearchResults(this, grid);
        return actor;
    },

    activateResult: function(resultId) {
		if(this._lastResult) {
			St.Clipboard.get_default().set_text(this._lastResult.replace("\n", ""));
		}
        return true;
    }
}

function init() {
    currencyProvider = new CurrencyProvider('CURRENCY CONVERTER');
}

function enable() {
    Main.overview.addSearchProvider(currencyProvider);
}

function disable() {
    Main.overview.removeSearchProvider(currencyProvider);
}
