'use strict';

const FS = require('./../lib/fs');

const DISHES_FILE = 'config/chat-plugins/thecafe-foodfight.json';
const FOODFIGHT_COOLDOWN = 5 * 60 * 1000;

const thecafe = /** @type {ChatRoom} */ (Rooms.get('thecafe'));

/** @type {{[k: string]: string[]}} */
let dishes = {};
try {
	dishes = require(`../${DISHES_FILE}`);
} catch (e) {
	if (e.code !== 'MODULE_NOT_FOUND' && e.code !== 'ENOENT') throw e;
}
if (!dishes || typeof dishes !== 'object') dishes = {};

function saveDishes() {
	FS(DISHES_FILE).write(JSON.stringify(dishes));
}

/**
 * @param {string} [generator]
 */
function generateTeam(generator = '') {
	let potentialPokemon = Object.keys(Dex.data.Pokedex).filter(mon => {
		const template = Dex.getTemplate(mon);
		return template.baseSpecies === template.species;
	});
	let speciesClause = true;
	switch (generator) {
	case 'ou':
		potentialPokemon = potentialPokemon.filter(mon => {
			const template = Dex.getTemplate(mon);
			return template.tier === 'OU';
		}).concat(potentialPokemon.filter(mon => {
			// There is probably a better way to get the ratios right, oh well.
			const template = Dex.getTemplate(mon);
			return template.tier === 'OU' || template.tier === 'UU';
		}));
		break;
	case 'ag':
		potentialPokemon = potentialPokemon.filter(mon => {
			const template = Dex.getTemplate(mon);
			const unviable = template.tier === 'NFE' || template.tier === 'PU' || template.tier === '(PU)' || template.tier.startsWith("LC");
			const illegal = template.tier === 'Unreleased' || template.tier === 'Illegal' || template.tier.startsWith("CAP");
			return !(unviable || illegal);
		});
		speciesClause = false;
		break;
	default:
		potentialPokemon = potentialPokemon.filter(mon => {
			const template = Dex.getTemplate(mon);
			const op = template.tier === 'AG' || template.tier === 'Uber';
			const unviable = template.tier === 'Illegal' || template.tier.includes("LC");
			return !(op || unviable);
		});
		potentialPokemon.push('miltank', 'miltank', 'miltank', 'miltank'); // 5x chance for miltank for flavor purposes.
	}

	/** @type {string[]} */
	const team = [];

	while (team.length < 6) {
		const randIndex = Math.floor(Math.random() * potentialPokemon.length);
		const potentialMon = potentialPokemon[randIndex];
		if (team.includes(potentialMon)) continue;
		team.push(potentialMon);
		if (speciesClause) potentialPokemon.splice(randIndex, 1);
	}

	return team.map(mon => Dex.getTemplate(mon).species);
}

/**
 * @return {[string, string[]]}
 */
function generateDish() {
	const keys = Object.keys(dishes);
	const entry = dishes[keys[Math.floor(Math.random() * keys.length)]].slice();
	const dish = entry.splice(0, 1)[0];
	const ingredients = [];
	while (ingredients.length < 6) {
		ingredients.push(entry.splice(Math.floor(Math.random() * entry.length), 1)[0]);
	}
	return [dish, ingredients];
}

/** @type {ChatCommands} */
const commands = {
	foodfight: function (target, room, user) {
		if (room !== thecafe) return this.errorReply("This command is only available in The Café.");

		if (!Object.keys(dishes).length) return this.errorReply("No dishes found. Add some dishes first.");

		// @ts-ignore
		if (user.foodfight && user.foodfight.timestamp + FOODFIGHT_COOLDOWN > Date.now()) return this.errorReply("Please wait a few minutes before using this command again.");

		const team = generateTeam(target);
		const [dish, ingredients] = generateDish();
		// @ts-ignore
		user.foodfight = {team: team, dish: dish, ingredients: ingredients, timestamp: Date.now()};
		return this.sendReplyBox(`<div class="ladder"><table style="text-align:center;"><tr><th colspan="7" style="font-size:10pt;">Your dish is: <u>${dish}</u></th></tr><tr><th>Team</th>${team.map(mon => `<td><psicon pokemon="${mon}"/> ${mon}</td>`).join('')}</tr><tr><th>Ingredients</th>${ingredients.map(ingredient => `<td>${ingredient}</td>`).join('')}</tr></table></div>`);
	},
	checkfoodfight: function (target, room, user) {
		if (room !== thecafe) return this.errorReply("This command is only available in The Café.");

		const targetUser = this.targetUserOrSelf(target, false);
		if (!targetUser) return this.errorReply(`User ${this.targetUsername} not found.`);
		const self = targetUser === user;
		if (!self && !this.can('mute', targetUser, room)) return false;
		// @ts-ignore
		if (!targetUser.foodfight) return this.errorReply(`${self ? `You don't` : `This user doesn't`} have an active Foodfight team.`);
		// @ts-ignore
		return this.sendReplyBox(`<div class="ladder"><table style="text-align:center;"><tr><th colspan="7" style="font-size:10pt;">${self ? `Your` : `${this.targetUsername}'s`} dish is: <u>${targetUser.foodfight.dish}</u></th></tr><tr><th>Team</th>${targetUser.foodfight.team.map(mon => `<td><psicon pokemon="${mon}"/> ${mon}</td>`).join('')}</tr><tr><th>Ingredients</th>${targetUser.foodfight.ingredients.map(ingredient => `<td>${ingredient}</td>`).join('')}</tr></table></div>`);
	},
	addingredients: 'adddish',
	adddish: function (target, room, user, connection, cmd) {
		if (room !== thecafe) return this.errorReply("This command is only available in The Café.");
		if (!this.can('mute', null, room)) return false;

		let [dish, ...ingredients] = target.split(',');
		dish = dish.trim();
		if (!dish || !ingredients.length) return this.parse('/help foodfight');
		const id = toId(dish);
		if (id === 'constructor') return this.errorReply("Invalid dish name.");
		ingredients = ingredients.map(ingredient => ingredient.trim());

		if (cmd === 'adddish') {
			if (dishes[id]) return this.errorReply("This dish already exists.");
			if (ingredients.length < 6) return this.errorReply("Dishes need at least 6 ingredients.");
			if ([...ingredients.entries()].some(([index, ingredient]) => ingredients.indexOf(ingredient) !== index)) {
				return this.errorReply("Please don't enter duplicate ingredients.");
			}
			dishes[id] = [dish];
		} else {
			if (!dishes[id]) return this.errorReply(`Dish not found: ${dish}`);
			if (ingredients.some(ingredient => dishes[id].includes(ingredient))) return this.errorReply("Please don't enter duplicate ingredients.");
			if ([...ingredients.entries()].some(([index, ingredient]) => ingredients.indexOf(ingredient) !== index)) {
				return this.errorReply("Please don't enter duplicate ingredients.");
			}
		}

		dishes[id] = dishes[id].concat(ingredients);
		saveDishes();
		this.sendReply(`${cmd.slice(3)} '${dish}: ${ingredients.join(', ')}' added successfully.`);
	},
	removedish: function (target, room, user) {
		if (room !== thecafe) return this.errorReply("This command is only available in The Café.");
		if (!this.can('mute', null, room)) return false;

		const id = toId(target);
		if (id === 'constructor') return this.errorReply("Invalid dish.");
		if (!dishes[id]) return this.errorReply(`Dish '${target}' not found.`);

		delete dishes[id];
		saveDishes();
		this.sendReply(`Dish '${target}' deleted successfully.`);
	},
	viewdishes: function (target, room, user, connection) {
		if (room !== thecafe) return this.errorReply("This command is only available in The Café.");

		return this.parse(`/join view-foodfight`);
	},
	foodfighthelp: [
		`/foodfight <generator> - Gives you a randomly generated Foodfight dish, ingredient list and team. Generator can be either 'ou' or 'ag', or left blank. If left blank, uses the normal Foodfight generator.`,
		`/checkfoodfight <username> - Gives you the last team and dish generated for the entered user, or your own if left blank. Anyone can check their own info, checking other people requires: % @ * # & ~`,
		`/adddish <dish>, <ingredient>, <ingredient>, ... - Adds a dish to the database. Requires: % @ * # & ~`,
		`/addingredients <dish>, <ingredient>, <ingredient>, ... - Adds extra ingredients to a dish in the database. Requires: % @ * # & ~`,
		`/removedish <dish> - Removes a dish from the database. Requires: % @ * # & ~`,
		`/viewdishes - Shows the entire database of dishes. Requires: % @ * # & ~`,
	],
};

exports.commands = commands;

/** @type {PageTable} */
const pages = {
	foodfight(query, user, connection) {
		if (!user.named) return Rooms.RETRY_AFTER_LOGIN;
		let buf = `|title|Foodfight\n|pagehtml|<div class="pad ladder"><h2>Foodfight Dish list</h2>`;
		if (!user.can('mute', null, thecafe)) {
			return buf + `<p>Access denied</p></div>`;
		}
		let content = Object.keys(dishes).map(entry => {
			const [dish, ...ingredients] = dishes[entry];
			return `<tr><td>${dish}</td><td>${ingredients.join(', ')}</td></tr>`;
		}).join('');

		if (!content) {
			buf += `<p>There are no dishes in the database.</p>`;
		} else {
			buf += `<table><tr><th><h3>Dishes</h3></th><th><h3>Ingredients</h3></th></tr>${content}</table>`;
		}
		buf += `</div>`;
		return buf;
	},
};
exports.pages = pages;
