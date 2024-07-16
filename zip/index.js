document.onreadystatechange = function () {
    if (document.readyState == "complete") {
        initApplication();
    }
}

function getEntries(file, centralDirectoryStart = 0){
    const isFirstTry = !centralDirectoryStart;
    const INITIAL_READ_SIZE = 1000000; //start by reading 1MB
    return new Promise((resolve, reject)=>{

        const reader = new FileReader();
        const readStartLocation = isFirstTry ? Math.max(0, file.size - INITIAL_READ_SIZE) : centralDirectoryStart;
        const blob = file.slice(readStartLocation, file.size);
        reader.onerror = function(){
            console.error('Error reading blob', this);
            reject(this);
        }
        reader.onload = (function(){
            return function(event){
                // console.log( 'event', event, 'result', event.target.result);
                const arrayBuffer = event.target.result;
                const data = new Uint8Array(arrayBuffer);

                // ZipInfo is a global variable (on the window object) exposed by zipinfo.js
                const entries = window.entries = ZipInfo.getEntries(data, readStartLocation);
                // console.log(`Total size: ${file.size}, offset: ${offset}`, entries);
                if(entries[0].centralDirectoryStart < readStartLocation){
                    // We need to try again to read the entire thing
                    getEntries(file, entries[0].centralDirectoryStart).then(d=>resolve(d)).catch(e=>reject(e));
                } else {
                    // We found our info, resolve the promise now
                    resolve(entries);
                }
            }
        })();
        reader.readAsArrayBuffer(blob);
    });

}

function initApplication(){
    document.querySelector('#file').addEventListener('change',function(){
        const file = window.file = this.files[0];
        console.log(file);
        getEntries(file).then(entries=>displayResults(file, entries)).catch(e=>console.log('Error :(', e));
    })
}

function displayResults(file, entries){
    entries.splice(0, 1); // get rid of first fake root directory entry added by ZipInfo
    
    const fileList = entries.filter(e=>e.directory == false);
    const directoryStrings = Array.from(new Set(
        entries.map(e=>e.filename.split(/[\/\\]/).slice(0,-1).reduce((a,part)=>{
            const prev = a.slice(-1)[0];
            a.push(prev ? [prev, part].join('/') : part);
            return a;
        }, [])).flat()
    ));
    const directoryList = directoryStrings.map(s=>s.split('/')).sort((a,b)=>a.length-b.length);
    // const directoryList = Array.from(new Set(entries.map(e=>e.filename.split(/[\/\\]/).slice(0,-1).filter(p=>p.length)).join('/').sort((a,b) => a.length-b.length));

    // const directoryList = entries.filter(e=>e.directory).map(e=>e.filename.split(/[\/\\]/).filter(p=>p.length)).sort((a,b) => a.length-b.length);

    const zip = {
        name: file.name,
        size: file.size,
        zipfile: file,
        directories:{},
        files:[],
        totalFileSize: 0,
        getSize: function(){
            return this.directories.reduce((a,dir)=> a+dir.getSize(), this.totalFileSize);
        }
    };
    allDirectories = {};

    
    for(const d of directoryList){
        const full = d.join('/');
        const parent = d.slice(0, -1).join('/')
        const name = d.slice(-1)[0];
        const info =  {
            name: name,
            directories: [],
            files:[],
            totalFileSize:0,
            getSize:function(){
                return this.directories.reduce((a,dir)=> a+dir.getSize(), this.totalFileSize);
            }
        }
        allDirectories[full] = info;
        if(allDirectories[parent]) allDirectories[parent].directories.push(info);
        else zip.directories[full] = info;
    }
    
    for(const f of fileList){
        const parts = f.filename.split(/[\/\\]/);
        const name = parts.splice(-1)[0];
        const path = parts.join('/');
        const info = {name:name, size: f.uncompressedSize}
        if(allDirectories[path]){
            allDirectories[path].files.push(info);
            allDirectories[path].totalFileSize += info.size;
        } else{
            info.name = f.filename;
            zip.files.push(info);
            zip.totalFileSize += info.size;
        }
    }

    console.log(zip);

    const container = document.querySelector('#output');
    container.innerText = '';
    
    const h3 = document.createElement('h3');
    container.appendChild(h3);
    h3.innerText = `File: ${zip.name} (size = ${humanFileSize(zip.size, true, 2)})`;
    for(const dir of Object.values(zip.directories)){
        container.appendChild(makeDir(dir));
    }
    container.appendChild(makeDir(zip, true, 'Files in root of zip'))
    
}

function makeDir(info, ignoreDirs, alternativeName){
    const div = document.createElement('div');
    div.classList.add('directory', 'collapsed');
    const name = document.createElement('div');
    name.innerText = `${alternativeName || info.name}: ${info.files.length} files, ${ignoreDirs? '' : info.directories.length + ' directories, '}${humanFileSize(info.getSize(),true,2)}`;
    name.classList.add('folder-title');
    
    div.appendChild(name);
    name.addEventListener('click', ()=>div.classList.toggle('collapsed'));

    if(!ignoreDirs){
        for(const dir of Object.values(info.directories)){
            div.appendChild(makeDir(dir));
        }
    }
    const fileDiv = document.createElement('div');
    fileDiv.classList.add('file-list');
    div.appendChild(fileDiv);
    for(const file of info.files){
        const name = document.createElement('div');
        name.innerText = file.name;
        const size = document.createElement('div');
        size.innerText = humanFileSize(file.size, true, 2);
        fileDiv.appendChild(name);
        fileDiv.appendChild(size);
    }

    return div;
}

/**
 * Format bytes as human-readable text.
 * 
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use 
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 * 
 * @return Formatted string.
 */
function humanFileSize(bytes, si=false, dp=1) {
    const thresh = si ? 1000 : 1024;

    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }

    const units = si 
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10**dp;

    do {
        bytes /= thresh;
        ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


    return bytes.toFixed(dp) + ' ' + units[u];
}