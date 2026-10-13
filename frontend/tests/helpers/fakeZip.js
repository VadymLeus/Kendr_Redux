// Підміна JSZip для тестів експорту: зберігає, які файли було додано в архів, і не створює справжній zip.
export const zipState = { files: {}, options: null };

export const resetZip = () => {
    zipState.files = {};
    zipState.options = null;
};

export class FakeZip {
    file(path, content) {
        zipState.files[path] = content;
        return this;
    }

    folder(name) {
        return {
            file: (path, content) => {
                zipState.files[`${name}/${path}`] = content;
            },
        };
    }

    async generateAsync(options) {
        zipState.options = options;
        return { fakeZipBlob: true };
    }
}
