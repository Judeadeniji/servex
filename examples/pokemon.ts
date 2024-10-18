import { serve } from "bun";
import { createServer } from "../src";
import { route } from "../src/router";
import { context, params, request } from "../src/hooks";
import { HttpException } from "../src/http-exception";
import type { Context, MiddlewareHandler } from "../src/types";
import { RouterType } from "../src/router/adapter";


// ----------------------
//  Little Hacks
// ----------------------
const sysConsoleLog = console.log;
console.log = () => {}
function log(...args: Parameters<typeof console.log>) {
  const stack = new Error().stack || '';
  const caller = stack.split('\n')[2].trim();
  sysConsoleLog(`[${new Date().toISOString()}] ${caller}:\n`, ...args);
}

if (log !== sysConsoleLog) {
  console.log = log
}

// ----------------------
// Define Types and Interfaces
// ----------------------

// Pokémon interface
interface Pokemon {
  id: number;
  name: string;
  type: string;
  level: number;
  skills: Skill[];
  points: number;
  rank: number;
}

// Skill interface
interface Skill {
  id: number;
  name: string;
  damage: number;
  type: string;
}

// Battle interface
interface Battle {
  id: number;
  pokemon1Id: number;
  pokemon2Id: number;
  winnerId: number | null; // null if battle is ongoing or tied
  date: Date;
}

// ----------------------
// In-Memory Data Storage
// ----------------------

let pokemons: Pokemon[] = [];
let skills: Skill[] = [];
let battles: Battle[] = [];
let nextPokemonId = 1;
let nextSkillId = 1;
let nextBattleId = 1;

// ----------------------
// Middleware Definitions
// ----------------------

// Logger Middleware
const loggerMiddleware: MiddlewareHandler<Context> = async (_, next) => {
  const c = context();
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.url}`);
  await next();
  console.log("Response sent");
};

// ----------------------
// Helper Functions
// ----------------------

// Function to calculate rank based on points
const calculateRank = (points: number): number => {
  // Higher points = higher rank (1 being the highest)
  const sorted = [...pokemons].sort((a, b) => b.points - a.points);
  return sorted.findIndex((p) => p.points <= points) + 1;
};

// Function to update ranks after points change
const updateRanks = () => {
  pokemons.forEach((pokemon) => {
    pokemon.rank = calculateRank(pokemon.points);
  });
};

// Function to resolve a battle
const resolveBattle = (battle: Battle): Battle => {
  const pokemon1 = pokemons.find((p) => p.id === battle.pokemon1Id);
  const pokemon2 = pokemons.find((p) => p.id === battle.pokemon2Id);

  if (!pokemon1 || !pokemon2) {
    throw new HttpException(400, "One or both Pokémon not found");
  }

  // Simple battle logic based on total skill damage and level
  const pokemon1Power =
    pokemon1.skills.reduce((sum, skill) => sum + skill.damage, 0) +
    pokemon1.level * 2;
  const pokemon2Power =
    pokemon2.skills.reduce((sum, skill) => sum + skill.damage, 0) +
    pokemon2.level * 2;

  if (pokemon1Power > pokemon2Power) {
    battle.winnerId = pokemon1.id;
    pokemon1.points += 10;
    pokemon2.points += 5;
  } else if (pokemon2Power > pokemon1Power) {
    battle.winnerId = pokemon2.id;
    pokemon2.points += 10;
    pokemon1.points += 5;
  } else {
    battle.winnerId = null; // Tie
    pokemon1.points += 5;
    pokemon2.points += 5;
  }

  battle.date = new Date();

  // Update ranks after points change
  updateRanks();

  return battle;
};

// ----------------------
// Routes Definitions
// ----------------------

// ----- Pokémon Routes -----

// Route to get a single Pokémon by ID
const singlePokemon = route("GET /:id", (c) => {
  const idParam = params("id");
  if (!idParam) {
    throw new HttpException(400, "ID parameter is required");
  }

  const id = parseInt(idParam, 10);
  const pokemon = pokemons.find((p) => p.id === id);

  if (!pokemon) {
    throw new HttpException(404, "Pokémon not found");
  }

  return c.json(pokemon);
});

// Route to list all Pokémon
const listPokemons = route(
  "GET /pokemons",
  (c) => {
    return c.json(pokemons);
  },
  {
    children: [singlePokemon],
  }
);

// Route to add a new Pokémon
const addPokemon = route("POST /pokemons", async (c) => {
  const req = request();
  
  const body = await req.json<{
    name: string;
    type: string;
    level: number;
    skills?: number[]; // Array of Skill IDs
  }>();

  if (
    !body.name ||
    typeof body.name !== "string" ||
    !body.type ||
    typeof body.type !== "string" ||
    !body.level ||
    typeof body.level !== "number"
  ) {
    throw new HttpException(400, "Invalid Pokémon data");
  }

  // Validate skills if provided
  let assignedSkills: Skill[] = [];
  if (body.skills) {
    assignedSkills = body.skills.map((skillId) => {
      const skill = skills.find((s) => s.id === skillId);
      if (!skill) {
        throw new HttpException(400, `Skill with ID ${skillId} not found`);
      }
      return skill;
    });
  }

  const newPokemon: Pokemon = {
    id: nextPokemonId++,
    name: body.name,
    type: body.type,
    level: body.level,
    skills: assignedSkills,
    points: 0,
    rank: 0, // Will be updated
  };
  pokemons.push(newPokemon);

  // Update ranks after adding a new Pokémon
  updateRanks();

  return c
    .setCookies({
      favoritePokemon: newPokemon.name,
      trainerLevel: "beginner",
    })
    .json(newPokemon, 201);
});

// Route to delete a Pokémon by ID
const deletePokemon = route("DELETE /pokemons/:id", (c) => {
  const idParam = params("id");
  if (!idParam) {
    throw new HttpException(400, "ID parameter is required");
  }

  const id = parseInt(idParam, 10);
  const initialLength = pokemons.length;
  pokemons = pokemons.filter((p) => p.id !== id);

  if (pokemons.length === initialLength) {
    throw new HttpException(404, "Pokémon not found");
  }

  // Update ranks after deletion
  updateRanks();

  return new Response(null, { status: 204 });
});

// ----- Skill Routes -----

// Route to get all skills
const listSkills = route("GET /skills", (c) => {
  return c.json(skills);
});

// Route to add a new skill
const addSkill = route("POST /skills", async (c) => {
  const req = request();
  const body = await req.json<{
    name: string;
    damage: number;
    type: string;
  }>();

  if (
    !body.name ||
    typeof body.name !== "string" ||
    !body.damage ||
    typeof body.damage !== "number" ||
    !body.type ||
    typeof body.type !== "string"
  ) {
    throw new HttpException(400, "Invalid Skill data");
  }

  const newSkill: Skill = {
    id: nextSkillId++,
    name: body.name,
    damage: body.damage,
    type: body.type,
  };
  skills.push(newSkill);

  return c.json(newSkill, 201);
});

// ----- Battle Routes -----

// Route to get a single battle by ID
const singleBattle = route("GET :id", (c) => {
  const idParam = params("id");
  if (!idParam) {
    throw new HttpException(400, "ID parameter is required");
  }

  const id = parseInt(idParam, 10);
  const battle = battles.find((b) => b.id === id);

  if (!battle) {
    throw new HttpException(404, "Battle not found");
  }

  return c.json(battle);
});

// Route to list all battles
const listBattles = route("GET /battles", (c) => {
  return c.json(battles);
}, {
  children: [singleBattle],
});

// Route to create a new battle
const createBattle = route("POST /battles", async (c) => {
  const req = request();
  const body = await req.json<{
    pokemon1Id: number;
    pokemon2Id: number;
  }>();

  if (
    !body.pokemon1Id ||
    typeof body.pokemon1Id !== "number" ||
    !body.pokemon2Id ||
    typeof body.pokemon2Id !== "number"
  ) {
    throw new HttpException(400, "Invalid Battle data");
  }

  if (body.pokemon1Id === body.pokemon2Id) {
    throw new HttpException(400, "A Pokémon cannot battle itself");
  }

  const pokemon1 = pokemons.find((p) => p.id === body.pokemon1Id);
  const pokemon2 = pokemons.find((p) => p.id === body.pokemon2Id);

  if (!pokemon1 || !pokemon2) {
    throw new HttpException(400, "One or both Pokémon not found");
  }

  const newBattle: Battle = {
    id: nextBattleId++,
    pokemon1Id: pokemon1.id,
    pokemon2Id: pokemon2.id,
    winnerId: null, // Will be determined upon resolution
    date: new Date(),
  };
  battles.push(newBattle);

  await Bun.sleep(Math.random() * 2000); // Simulate battle resolution delay

  // Resolve the battle immediately for simplicity
  resolveBattle(newBattle);

  return c.json(newBattle, 201);
});

// ----- Leaderboard Route -----

// Route to get the leaderboard
const getLeaderboard = route("GET /leaderboard", (c) => {
  const sortedPokemons = [...pokemons].sort((a, b) => b.points - a.points);
  return c.json(sortedPokemons);
});

// ----------------------
// Server Setup
// ----------------------

// Create the server with routes and middlewares
const server = createServer({
  router: RouterType.TRIE,
  routes: [
    listPokemons,
    addPokemon,
    deletePokemon,
    listSkills,
    addSkill,
    listBattles,
    createBattle,
    getLeaderboard,
  ],
  middlewares: [loggerMiddleware],
});

export default server.fetch

// Start the server on port 3000
// serve({
//   port: 3000,
//   fetch: server.fetch,
// });

console.log("Pokémon Server is running on http://localhost:3000");
