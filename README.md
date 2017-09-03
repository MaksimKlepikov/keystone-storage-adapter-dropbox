# Dropbox storage adapter for keystonejs

## Usage

Configure the storage adapter:

```js
var storage = new keystone.Storage({
  adapter: require('keystone-storage-adapter-dropbox'),
  dropbox: {
      accessToken: process.env.DROPBOX_ACCESS_TOKEN,// your dropbox-app access token
      path: process.env.DROPBOX_PATH + '/uploads',// any path
  },
  path: process.env.DROPBOX_PATH + '/uploads',
  schema: {
    filename: true,
    path_display: true,
    path: true,
    id: true,
    url: true,
    originalname: true,   // the original (uploaded) name of the file; useful when filename generated
  },
});
```

Then use it as the storage provider for a File field:

```js
File.add({
  name: { type: String },
  file: { type: Types.File, storage: storage },
});
```

### Options:

The adapter requires an additional `s3` field added to the storage options. It accepts the following values:

- **accessToken**: *(required)* Dropbox app access token. 

- **path**: Storage path inside the app folder.



### Tips

 - Delete file from dropbox if delete from db

    ```js
        Documents.schema.post('remove', async function (doc) {
            return storage.removeFile(doc.file, () => {
        
            });
        });
    ```



# License

Licensed under the standard MIT license. See [LICENSE](license).
