export namespace capcut {
	
	export class TimelineSummary {
	    id: string;
	    name: string;
	    isActive: boolean;
	    isMain: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TimelineSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.isActive = source["isActive"];
	        this.isMain = source["isMain"];
	    }
	}
	export class DraftSelection {
	    token: string;
	    name: string;
	    draftPath: string;
	    requiresTimelineChoice: boolean;
	    recommendedTimelineId?: string;
	    timelines: TimelineSummary[];
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new DraftSelection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.name = source["name"];
	        this.draftPath = source["draftPath"];
	        this.requiresTimelineChoice = source["requiresTimelineChoice"];
	        this.recommendedTimelineId = source["recommendedTimelineId"];
	        this.timelines = this.convertValues(source["timelines"], TimelineSummary);
	        this.warnings = source["warnings"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class CapcutDraftResult {
	    name: string;
	    text: string;
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new CapcutDraftResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.text = source["text"];
	        this.warnings = source["warnings"];
	    }
	}
	export class MediaAsset {
	    id: string;
	    name: string;
	    path: string;
	    url: string;
	    previewUrl?: string;
	    thumbnail?: string;
	    waveform?: number[];
	    color?: string;
	    kind: string;
	    width: number;
	    height: number;
	    fps: number;
	    duration: number;
	    hasAudio: boolean;
	    missing: boolean;
	    folder?: string;
	
	    static createFrom(source: any = {}) {
	        return new MediaAsset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.url = source["url"];
	        this.previewUrl = source["previewUrl"];
	        this.thumbnail = source["thumbnail"];
	        this.waveform = source["waveform"];
	        this.color = source["color"];
	        this.kind = source["kind"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fps = source["fps"];
	        this.duration = source["duration"];
	        this.hasAudio = source["hasAudio"];
	        this.missing = source["missing"];
	        this.folder = source["folder"];
	    }
	}
	export class ProjectOpenResult {
	    path: string;
	    json: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectOpenResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.json = source["json"];
	    }
	}
	export class SystemInfo {
	    ffmpeg: boolean;
	    ffprobe: boolean;
	    version: string;
	    ffmpegVersion: string;
	    ffmpegPath: string;
	    ffprobePath: string;
	
	    static createFrom(source: any = {}) {
	        return new SystemInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ffmpeg = source["ffmpeg"];
	        this.ffprobe = source["ffprobe"];
	        this.version = source["version"];
	        this.ffmpegVersion = source["ffmpegVersion"];
	        this.ffmpegPath = source["ffmpegPath"];
	        this.ffprobePath = source["ffprobePath"];
	    }
	}
	export class TextFileResult {
	    path: string;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new TextFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.text = source["text"];
	    }
	}

}

export namespace project {
	
	export class ProjectEntry {
	    id: string;
	    name: string;
	    path: string;
	    cover?: string;
	    sizeBytes: number;
	    duration: number;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.cover = source["cover"];
	        this.sizeBytes = source["sizeBytes"];
	        this.duration = source["duration"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class RecentEntry {
	    name: string;
	    path: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class StorageInfo {
	    dataDir: string;
	    activeDrive: string;
	    isPortable: boolean;
	    projectsDir: string;
	    cacheDir: string;
	    tempDir: string;
	    modelsDir: string;
	
	    static createFrom(source: any = {}) {
	        return new StorageInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dataDir = source["dataDir"];
	        this.activeDrive = source["activeDrive"];
	        this.isPortable = source["isPortable"];
	        this.projectsDir = source["projectsDir"];
	        this.cacheDir = source["cacheDir"];
	        this.tempDir = source["tempDir"];
	        this.modelsDir = source["modelsDir"];
	    }
	}

}

export namespace updater {
	
	export class UpdateInfo {
	    available: boolean;
	    currentVersion: string;
	    latestVersion: string;
	    releaseName: string;
	    releaseNotes: string;
	    downloadUrl: string;
	    assetName: string;
	    assetSize: number;
	    publishedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseName = source["releaseName"];
	        this.releaseNotes = source["releaseNotes"];
	        this.downloadUrl = source["downloadUrl"];
	        this.assetName = source["assetName"];
	        this.assetSize = source["assetSize"];
	        this.publishedAt = source["publishedAt"];
	    }
	}
	export class UpdateSettings {
	    autoCheck: boolean;
	    lastChecked: number;
	
	    static createFrom(source: any = {}) {
	        return new UpdateSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.autoCheck = source["autoCheck"];
	        this.lastChecked = source["lastChecked"];
	    }
	}

}

export namespace whisper {
	
	export class WhisperModel {
	    id: string;
	    name: string;
	    filename: string;
	    sizeMB: number;
	    installed: boolean;
	    path?: string;
	
	    static createFrom(source: any = {}) {
	        return new WhisperModel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.filename = source["filename"];
	        this.sizeMB = source["sizeMB"];
	        this.installed = source["installed"];
	        this.path = source["path"];
	    }
	}

}

