/*
TODO
- Check whether files exist before uploading (will always overwrite as-is)
- Support multiple retry attempts if a file exists (see FS Adapter)
*/

// Mirroring keystone 0.4's support of node 0.12.
var assign = require('object-assign');
var ensureCallback = require('keystone-storage-namefunctions/ensureCallback');

var Dropbox = require('dropbox');
var nameFunctions = require('keystone-storage-namefunctions');
var pathlib = require('path');
var fs = require('fs');

var DEFAULT_OPTIONS = {
    accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    generateFilename: nameFunctions.randomFilename,
};

// This constructor is usually called indirectly by the Storage class
// in keystone.

// S3-specific options should be specified in an `options.s3` field,
// which can contain the following options: { key, secret, bucket, region,
// headers, path }.

// The schema can contain the additional fields { path, bucket, etag }.

// See README.md for details and usage examples.

function DropboxAdapter(options, schema) {
    this.options = assign({}, DEFAULT_OPTIONS, options.dropbox);

    // Support `defaultHeaders` option alias for `headers`
    // TODO: Remove me with the next major version bump
    // if (this.options.defaultHeaders) {
    //     this.options.headers = this.options.defaultHeaders;
    // }

    // Knox will check for the 'key', 'secret' and 'bucket' options.
    this.client = new Dropbox(this.options);
    // this.client = knox.createClient(this.options);

    // If path is specified it must be absolute.
    if (options.path !== null && !pathlib.isAbsolute(options.path)) {
        throw Error('Configuration error: Dropbox path must be absolute');
    }

    // Ensure the generateFilename option takes a callback
    this.options.generateFilename = ensureCallback(this.options.generateFilename);
}

DropboxAdapter.compatibilityLevel = 1;

// All the extra schema fields supported by this adapter.
DropboxAdapter.SCHEMA_TYPES = {
    filename: String,
    path_display: String,
    path: String,
    id: String,
    url: String,
    originalname: String,   // the original (uploaded) name of the file; useful when filename generated
};

DropboxAdapter.SCHEMA_FIELD_DEFAULTS = {
    filename: true,
    path_display: true,
    path: true,
    id: true,
    url: true,
    originalname: true,   // the original (uploaded) name of the file; useful when filename generated
};

// Get the full, absolute path name for the specified file.
DropboxAdapter.prototype._resolveFilename = function (file) {
    // Just like the bucket, the schema can store the path for files. If the path
    // isn't stored we'll assume all the files are in the path specified in the
    // s3.path option. If that doesn't exist we'll assume the file is in the root
    // of the bucket. (Whew!)
    var path = file.path || this.options.path || '/';
    return pathlib.posix.resolve(path, file.filename);
};

DropboxAdapter.prototype.uploadFile = function (file, callback) {
    var self = this;
    this.options.generateFilename(file, 0, function (err, filename) {
        if (err) return callback(err);

        // The expanded path of the file on the filesystem.
        var localpath = file.path;

        // The destination path inside the S3 bucket.
        file.path = self.options.path;
        file.filename = file.originalname;
        var destpath = self._resolveFilename(file);

        // Figure out headers
        var headers = assign({}, self.options.headers, {
            'Content-Length': file.size,
            'Content-Type': file.mimetype
        });

        fs.readFile(localpath, function (err, data) {

            self.client.filesUpload({path: destpath, contents: data})
                .then(function (response) {
                    return self.share(response.path_display, response.id)
                })
                .then(function (shared_file) {
                    return callback(null, assign({}, shared_file, file));
                })
                .catch(function (error) {
                    callback(error);
                });
        });
    });
};

// Note that this will provide a public URL for the file, but it will only
// work if:
// - the bucket is public (best) or
// - the file is set to a canned ACL (ie, headers:{ 'x-amz-acl': 'public-read' } )
// - you pass credentials during your request for the file content itself
DropboxAdapter.prototype.getFileURL = function (file) {
    // Consider providing an option to use insecure http. I can't think of any
    // sensible use case for plain http though. https should be used everywhere.
    return file.url;
};

DropboxAdapter.prototype.removeFile = function (file, callback) {
    var fullpath = this._resolveFilename(file);

    this.client.filesDeleteV2({
        path: fullpath
    })
        .then(function () {
            callback();
        })
        .catch(function (e) {
            callback(e);
        })
};

// Check if a file with the specified filename already exists. Callback called
// with the file headers if the file exists, null otherwise.
DropboxAdapter.prototype.fileExists = function (filename, callback) {
    var fullpath = this._resolveFilename({filename: filename});
    this.client.filesListFolder({path: fullpath})
        .then(function (res) {
            if (res.entries.length) {
                return callback(null, res.headers);
            }
            return callback();
        })
        .catch(function (err) {
            if (err) return callback(err);

        })
};

DropboxAdapter.prototype.fileList = function (path) {// '/example_folder'
    return this.client.filesListFolder({path: path})

}

DropboxAdapter.prototype.updateFolder = function (folder_name) {
    var self = this;
    return this.client.filesDeleteV2({
        path: '/' + folder_name
    })
        .catch(function (e) {
            return self.client.filesCreateFolderV2({path: '/' + folder_name})
        })
};

DropboxAdapter.prototype.share = function (path_display, id) {
    var shareRes;
    var self = this;

    return this.client.sharingCreateSharedLinkWithSettings({path: path_display})
        .then(function () {
            //do this for direct access (...dl=0 => ...dl=1)
            shareRes.url = shareRes.url.slice(0, -1);
            shareRes.url += '1';

            return shareRes;
        })
        .catch(function () {
            return self.client.sharingListSharedLinks({path: id})
                .then(function (response) {
                    //do this for direct access (...dl=0 => ...dl=1)
                    response.links[0].url = response.links[0].url.slice(0, -1);
                    response.links[0].url += '1';

                    return response.links[0];
                });
        })
};
module.exports = DropboxAdapter;
