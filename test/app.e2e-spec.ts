import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { AppController } from './../src/app.controller';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let appController: AppController;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    appController = app.get<AppController>(AppController);
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    expect(appController.getHealth()).toEqual({
      service: 'common-auth',
      status: 'ok',
    });
  });
});
