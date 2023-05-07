import { exec } from "child_process";
import fse from "fs-extra";
import inquirer from "inquirer";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { CreateAppOptions } from "../types";

const databases = [
	"MySQL",
	"MongoDB",
	"SQLite",
	"PostgreSQL",
	"SQLServer",
	"CockroachDB"
] as const;

type DatabaseType = (typeof databases)[number];

interface Answers {
	name: string;
	gitRepo: boolean;
	install: boolean;
	prisma: boolean;
	databaseType?: DatabaseType;
	databaseUri?: string;
	typescript: boolean;
	helpCommand: boolean;
	dashboard: boolean;
	eslintAndPrettier: boolean;
}

interface ScaffoldOptions extends Answers {
	packageManager: PackageManager;
	projectDirectory: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDirectory = resolve(__dirname, "../templates");

/**
 * Create a new Ferod app.
 */
export async function createFerodApp(options: CreateAppOptions): Promise<void> {
	const answers = await getAnswers(options);

	const packageManager = getUserPackageManager();

	const name = answers.name ?? options.name;

	const projectDirectory = resolve(process.cwd(), name);

	await scaffoldProject({
		...answers,
		packageManager,
		projectDirectory
	});
}

/**
 * Get the answers to the questions
 * @param options The options passed to the command
 * @returns The answers to the questions
 */
async function getAnswers(options: CreateAppOptions): Promise<Answers> {
	if (options.flags.yes) {
		return {
			name: options.name ?? "my-app",
			gitRepo: options.flags.noGit === undefined,
			install: options.flags.noInstall === undefined,
			prisma: true,
			databaseType: "MongoDB",
			databaseUri: `mongodb://localhost:27017/${options.name ?? "my-app"}`,
			typescript: true,
			helpCommand: true,
			dashboard: true,
			eslintAndPrettier: true
		};
	}

	return await inquirer.prompt([
		{
			name: "name",
			type: "input",
			message: "What is the name of your app?",
			default: "my-app",
			when: () => options.name === undefined
		},
		{
			name: "gitRepo",
			type: "confirm",
			message: "Initialize a git repository?",
			default: true,
			when: () => !options.flags.yes && options.flags.noGit === undefined
		},
		{
			name: "install",
			type: "confirm",
			message: "Install dependencies?",
			default: true,
			when: () => !options.flags.yes && options.flags.noInstall === undefined
		},
		{
			name: "prisma",
			type: "confirm",
			message: "Use Prisma?",
			default: true,
			when: () => !options.flags.yes
		},
		{
			name: "databaseType",
			type: "list",
			message: "What database do you want to use?",
			choices: databases,
			default: "MongoDB",
			when: (answers) => !options.flags.yes && answers.prisma
		},
		{
			name: "databaseUri",
			type: "input",
			message: "What is the database URI?",
			default: `mongodb://localhost:27017/${options.name ?? "my-app"}`,
			when: (answers) => !options.flags.yes && answers.prisma
		},
		{
			name: "typescript",
			type: "confirm",
			message: "Use TypeScript?",
			default: true,
			when: () => !options.flags.yes
		},
		{
			name: "helpCommand",
			type: "confirm",
			message: "Add a help command?",
			default: true,
			when: () => !options.flags.yes
		},
		{
			name: "dashboard",
			type: "confirm",
			message: "Add a dashboard?",
			default: true,
			when: () => !options.flags.yes
		},
		{
			name: "eslintAndPrettier",
			type: "confirm",
			message: "Use ESLint and Prettier?",
			default: true,
			when: () => !options.flags.yes
		}
	]);
}

type PackageManager = "npm" | "yarn" | "pnpm";

/**
 * Gets the user's package manager
 */
function getUserPackageManager(): PackageManager {
	// This environment variable is set by npm and yarn but pnpm seems less consistent
	const userAgent = process.env.npm_config_user_agent;
	if (userAgent === undefined) {
		return "npm";
	}

	if (userAgent.includes("yarn")) {
		return "yarn";
	} else if (userAgent.includes("pnpm")) {
		return "pnpm";
	}

	return "npm";
}

/**
 * Scaffold a new Ferod app
 */
async function scaffoldProject(options: ScaffoldOptions): Promise<void> {
	const templates = new Set([
		"base",
		options.typescript ? "base-ts" : "base-js"
	]);

	if (options.prisma) {
		templates.add("prisma");
	}

	if (options.eslintAndPrettier) {
		templates.add("eslint-prettier");
	}

	console.log(`Using ${options.packageManager} to scaffold the project`);

	// make project directory
	if (fse.existsSync(options.projectDirectory)) {
		if (fse.readdirSync(options.projectDirectory).length > 0) {
			console.log(
				`The directory ${options.projectDirectory} is not empty. Please try again.`
			);

			return;
		}
	} else {
		fse.mkdirSync(options.projectDirectory);
	}

	// initialize git repository
	if (options.gitRepo) {
		exec(`cd "${options.projectDirectory}" && git init`, (_, stdout) =>
			console.log(stdout)
		);
		fse.copySync(resolve(templatesDirectory, "git"), options.projectDirectory);
	}

	// copy base files
	const basePath = options.typescript ? "base-ts" : "base-js";
	fse.copySync(resolve(templatesDirectory, "base"), options.projectDirectory);
	fse.copySync(resolve(templatesDirectory, basePath), options.projectDirectory);

	// copy prisma files
	if (options.prisma) {
		fse.mkdirSync(resolve(options.projectDirectory, "prisma"));

		const databaseType = options.databaseType?.toLowerCase() ?? "mongodb";

		fse.copyFileSync(
			resolve(templatesDirectory, `prisma/${databaseType}.prisma`),
			resolve(options.projectDirectory, "prisma/schema.prisma")
		);
	}

	// copy eslint and prettier files
	if (options.eslintAndPrettier) {
		fse.copySync(
			resolve(templatesDirectory, "eslint-prettier"),
			options.projectDirectory
		);
	}

	// merge package.json files
	const packageJson = createPackageJson(options.name, ...templates);
	fse.writeJSONSync(
		resolve(options.projectDirectory, "package.json"),
		packageJson,
		{
			spaces: "\t"
		}
	);

	// install dependencies
	if (options.install) {
		exec(
			`cd "${options.projectDirectory}" && ${options.packageManager} install --ignore-workspace`,
			(_, stdout) => console.log(stdout)
		);
	}
}

/**
 * Merge the dependencies and devDependencies of all package.json template files
 * @param projectName The name of the project
 * @param paths The paths to the package.json files
 */
function createPackageJson(
	projectName: string,
	...templates: string[]
): Record<string, unknown> {
	type PackageJsonFieldEntries = [string, string][];

	const directories = templates.map((template) =>
		resolve(templatesDirectory, template)
	);

	const dependencies = new Map<string, string>();
	const devDependencies = new Map<string, string>();
	const scripts = new Map<string, string>();

	for (const directory of directories) {
		const packageJson = fse.readJSONSync(resolve(directory, "package.json"));

		const dependenciesEntries = Object.entries(
			packageJson.dependencies ?? {}
		) as PackageJsonFieldEntries;
		const devDependenciesEntries = Object.entries(
			packageJson.devDependencies ?? {}
		) as PackageJsonFieldEntries;
		const scriptsEntries = Object.entries(
			packageJson.scripts ?? {}
		) as PackageJsonFieldEntries;

		for (const [name, version] of dependenciesEntries) {
			dependencies.set(name, version);
		}

		for (const [name, version] of devDependenciesEntries) {
			devDependencies.set(name, version);
		}

		for (const [name, line] of scriptsEntries) {
			scripts.set(name, line);
		}
	}

	const basePackageJson = fse.readJSONSync(
		resolve(directories[0], "package.json")
	);

	return {
		...basePackageJson,
		name: projectName,
		scripts: Object.fromEntries(scripts),
		dependencies: Object.fromEntries(dependencies),
		devDependencies: Object.fromEntries(devDependencies)
	};
}
