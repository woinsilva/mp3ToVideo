import { Injectable } from '@nestjs/common';
import type { Project, ProjectStatus } from '@prisma/client';

@Injectable()
export class ProjectPresenter {
  summary(project: Project) {
    return {
      id: project.id,
      title: project.title,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
  }

  uploadResult(projectId: string, trackId: string, status: ProjectStatus) {
    return {
      projectId,
      trackId,
      status
    };
  }
}
