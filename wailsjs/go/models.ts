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
	    color?: string;
	    kind: string;
	    width: number;
	    height: number;
	    fps: number;
	    duration: number;
	    hasAudio: boolean;
	    missing: boolean;
	
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
	        this.color = source["color"];
	        this.kind = source["kind"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fps = source["fps"];
	        this.duration = source["duration"];
	        this.hasAudio = source["hasAudio"];
	        this.missing = source["missing"];
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

}

