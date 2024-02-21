const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/drive"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
	try {
		const content = await fs.readFile(TOKEN_PATH);
		const credentials = JSON.parse(content);
		return google.auth.fromJSON(credentials);
	} catch (err) {
		return null;
	}
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
	const content = await fs.readFile(CREDENTIALS_PATH);
	const keys = JSON.parse(content);
	const key = keys.installed || keys.web;
	const payload = JSON.stringify({
		type: "authorized_user",
		client_id: key.client_id,
		client_secret: key.client_secret,
		refresh_token: client.credentials.refresh_token,
	});
	await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
	let client = await loadSavedCredentialsIfExist();
	if (client) {
		return client;
	}
	client = await authenticate({
		scopes: SCOPES,
		keyfilePath: CREDENTIALS_PATH,
	});
	if (client.credentials) {
		await saveCredentials(client);
	}
	return client;
}

async function searchFolder(authClient) {
	const service = google.drive({ version: "v3", auth: authClient });

	try {
		const res = await service.files.list({
			q: "mimeType='application/vnd.google-apps.folder'",
			fields: "nextPageToken, files(id, name)",
			spaces: "drive",
			parents: ["appDataFolder"],
		});

		return res.data.files;
	} catch (err) {
		// TODO(developer) - Handle error
		throw err;
	}
}

async function listFilesInFolder(authClient, folderId) {
	const service = google.drive({ version: "v3", auth: authClient });
	try {
		const res = await service.files.list({
			q: `parents in '${folderId}'`,
			fields: "nextPageToken, files(id, name, mimeType)",
			spaces: "drive",
		});

		return res.data.files;
	} catch (err) {
		// TODO(developer) - Handle error
		throw err;
	}
}

async function downloadFile(authClient, fileId) {
	const service = google.drive({ version: "v3", auth: authClient });
	try {
		const file = await service.files.get({
			fileId: fileId,
			alt: "media",
		});

		return file;
	} catch (err) {
		// TODO(developer) - Handle error
		throw err;
	}
}

// function execute(command) {
// 	const exec = require("child_process").exec;

// 	exec(command, (err, stdout, stderr) => {
// 		process.stdout.write(stdout);
// 	});
// }

async function uploadToFolder(
	authClient,
	folderId,
	nameFile,
	mimeType,
	filePath
) {
	const fs = require("fs");

	const service = google.drive({ version: "v3", auth: authClient });

	const fileMetadata = {
		name: nameFile,
		parents: [folderId],
	};
	const media = {
		mimeType,
		body: fs.createReadStream(`${filePath}/${nameFile}`),
	};

	try {
		const file = await service.files.create({
			resource: fileMetadata,
			media: media,
			fields: "id",
		});

		return file;
	} catch (err) {
		// TODO(developer) - Handle error
		throw err;
	}
}

async function exportZip(authClient, fileId) {
	const service = google.drive({ version: "v3", auth: authClient });

	try {
		const result = await service.files.export({
			fileId: fileId,
			mimeType: "application/zip",
		});
		console.log(result);
		console.log(result.status);
		return result;
	} catch (err) {
		// TODO(developer) - Handle error
		throw err;
	}
}

async function shareFile(authClient, fileId) {
	const service = google.drive({ version: "v3", auth: authClient });
	const permissions = [
		{
			type: "anyone",
			role: "reader",
		},
	];

	for (const permission of permissions) {
		try {
			const result = await service.permissions.create({
				resource: permission,
				fileId: fileId,
				fields: "id",
			});

			return result.status;
		} catch (err) {
			// TODO(developer): Handle failed permissions
			console.error(err);
		}
	}
}

async function getFileInfo(authClient, folderId, fileId) {
	const service = google.drive({ version: "v3", auth: authClient });
	try {
		const res = await service.files.list({
			q: `parents in '${folderId}'`,
			fields:
				"nextPageToken, files(id, name, mimeType, webViewLink, webContentLink)",
			spaces: "drive",
		});

		const files = res.data.files;

		return files.find((file) => file.id == fileId);
	} catch (err) {
		// TODO(developer) - Handle error
		throw err;
	}
}

authorize()
	.then(async (auth) => {
		// List all folders in Drive
		const driveFiles = await searchFolder(auth);

		// Get the id of "transcriptions" folder
		const folder = driveFiles.find((folder) => folder.name == "transcriptions");

		// List files in the "transcriptions" folder
		const filesInFolder = await listFilesInFolder(auth, folder.id);
		console.log(filesInFolder);

		// Download the first file found in the "transcriptions" folder
		// The file isn't saved locally, only is gotten the full answer,
		// the file info probably is in the "data" attribute
		// const download = await downloadFile(auth, filesInFolder[0].id);

		// Initial method to download and save locally the first file in the
		// "transcriptions" folder. With this method the audio and video files
		// aren't allowed: https://developers.google.com/drive/api/guides/ref-export-formats?hl=es-419
		// I'm looking for a way to save the downloaded file.
		// const download = exportFile(auth, filesInFolder[0].id);

		// ############### Upload a txt file and get the public link to access it ################
		// Upload a text file in the "transcriptions" file
		const uploadResponseTxt = await uploadToFolder(
			auth,
			folder.id,
			"document.txt",
			"text/plain",
			"files"
		);

		// Status of uploading the previous file
		console.log(uploadResponseTxt.status);

		// Change file permissions to create the public link to access the file
		const sharedResponseTxt = await shareFile(auth, uploadResponseTxt.data.id);

		// Status of changing the permissions previously
		console.log(sharedResponseTxt);

		// Get the info of the file whose permissions where changed previously
		const sharedLinkTxt = await getFileInfo(
			auth,
			folder.id,
			uploadResponseTxt.data.id
		);

		// The public link to download directly the uploaded file
		console.log(sharedLinkTxt.webContentLink);

		// The public link to visualize the uploaded file
		console.log(sharedLinkTxt.webViewLink);

		// #######################################################################################

		// ############### Upload a jpg file and get the public link to access it ################
		// Upload a jpg file in the "transcriptions" file
		const uploadResponseJpg = await uploadToFolder(
			auth,
			folder.id,
			"photo.jpg",
			"image/jpg",
			"files"
		);

		// Status of uploading the previous file
		console.log(uploadResponseJpg.status);

		// Change file permissions to create the public link to access the file
		const sharedResponseJpg = await shareFile(auth, uploadResponseJpg.data.id);

		// Status of changing the permissions previously
		console.log(sharedResponseJpg);

		// Get the info of the file whose permissions where changed previously
		const sharedLinkJpg = await getFileInfo(
			auth,
			folder.id,
			uploadResponseJpg.data.id
		);

		// The public link to download directly the uploaded file
		console.log(sharedLinkJpg.webContentLink);

		// The public link to visualize the uploaded file
		console.log(sharedLinkJpg.webViewLink);

		// #######################################################################################
		// #######################################################################################
		// ############## TRYING TO CREATE A LOCAL FILE WITH THE DOWNLOADED DATA #################
		// #######################################################################################
		// #######################################################################################

		// const fs = require("fs");

		// const writer = fs.createWriteStream("video.mov");

		// writer.write(download.data);

		// const file = new Blob(download.data, {
		// 	type: download.headers.connection["content-type"],
		// });

		// console.log(typeof download.data);

		// console.log(download.data);
		// const file = new File(download.data, "myFile.mov");

		// #######################################################################################
		// #######################################################################################
		// #######################################################################################
		// #######################################################################################
		// #######################################################################################
	})
	.catch(console.error);
// [END drive_quickstart]
